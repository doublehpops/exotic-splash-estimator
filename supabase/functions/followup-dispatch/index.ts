// Sends due follow-up texts. Secrets come from the function environment
// (RETELL_*, TWILIO_*, SUPABASE_SERVICE_ROLE_KEY). They are not in this file.
// Voice calls are built only when followups.voiceEnabled is true. The scheduler
// does not create voice rows, and that switch defaults to false.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import "../_shared/followup-core.js";

// deno-lint-ignore no-explicit-any
const F = (globalThis as any).EsFollowup;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function env(name: string): string {
  return Deno.env.get(name) ?? "";
}

function providerHeaders(request: { url: string; bodyEncoding?: string }, provider: string): Record<string, string> {
  if (provider === "twilio") {
    const sid = env("TWILIO_ACCOUNT_SID");
    const token = env("TWILIO_AUTH_TOKEN");
    const basic = btoa(sid + ":" + token);
    return { Authorization: "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded" };
  }
  return { Authorization: "Bearer " + env("RETELL_API_KEY"), "Content-Type": "application/json" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  const expected = env("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== "Bearer " + expected) return json(401, { ok: false, error: "Unauthorized" });

  const url = env("SUPABASE_URL");
  if (!url) return json(500, { ok: false, error: "SUPABASE_URL is not set" });
  const admin = createClient(url, expected, { auth: { persistSession: false, autoRefreshToken: false } });

  const book = await admin.from("price_book").select("staff_settings").eq("id", 1).maybeSingle();
  if (book.error) return json(500, { ok: false, error: "Could not read follow-up switches" });
  const flags = F.normalizeFlags((book.data && book.data.staff_settings) || {});
  if (!flags.enabled) return json(200, { ok: true, held: true, reason: "disabled" });

  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await admin.from("job_followups").update({ status: "failed", last_error: "send did not finish" })
    .eq("status", "sending").is("provider_ref", null).lt("updated_at", staleBefore);

  const due = await admin.from("job_followups")
    .select("id,job_id,status,channel,job_outcome,scheduled_for,attempt_count,max_attempts,consent,opted_out_at,phone_e164,project_summary,customer_first_name,survey_token,provider_ref,sms_body,step,step_vars")
    .in("status", ["scheduled", "failed"])
    .lte("scheduled_for", new Date().toISOString())
    .limit(25);
  if (due.error) return json(500, { ok: false, error: "Could not list due follow-ups" });

  const runtimeEnv = {
    FOLLOWUP_SMS_PROVIDER: env("FOLLOWUP_SMS_PROVIDER"),
    RETELL_API_KEY: env("RETELL_API_KEY"),
    RETELL_FOLLOWUP_AGENT_ID: env("RETELL_FOLLOWUP_AGENT_ID"),
    RETELL_SMS_AGENT_ID: env("RETELL_SMS_AGENT_ID"),
    RETELL_VOICE_AGENT_ID: env("RETELL_VOICE_AGENT_ID"),
    RETELL_FROM_NUMBER: env("RETELL_FROM_NUMBER"),
    TWILIO_ACCOUNT_SID: env("TWILIO_ACCOUNT_SID"),
    TWILIO_AUTH_TOKEN: env("TWILIO_AUTH_TOKEN"),
    TWILIO_FROM_NUMBER: env("TWILIO_FROM_NUMBER"),
  };
  const surveyBase = env("FOLLOWUP_SURVEY_BASE_URL") || F.SURVEY_BASE;
  const counts: Record<string, number> = {};

  for (const raw of due.data || []) {
    const step = String(raw.step || "");
    if (F.isSequenceStep(step) && !flags.steps[step]) {
      counts.step_disabled = (counts.step_disabled || 0) + 1;
      continue;
    }
    const claimRes = await admin.rpc("service_claim_followup_send", { p_id: raw.id });
    const claim = claimRes.data as { ok?: boolean; reason?: string; attempt?: number; idempotencyKey?: string } | null;
    if (claimRes.error || !claim || claim.ok !== true) {
      const reason = (claim && claim.reason) || "not_claimed";
      counts[reason] = (counts[reason] || 0) + 1;
      continue;
    }
    const survey = raw.survey_token ? F.surveyUrl(surveyBase, raw.survey_token) : "";
    const row = {
      id: raw.id,
      jobId: raw.job_id,
      channel: raw.channel || "sms",
      consent: raw.consent === true,
      optedOut: !!raw.opted_out_at,
      phoneE164: raw.phone_e164 || "",
      firstName: raw.customer_first_name || "",
      outcome: raw.job_outcome || "undecided",
      projectSummary: raw.project_summary || "",
      surveyUrl: survey,
      attemptCount: claim.attempt,
      idempotencyKey: claim.idempotencyKey,
      smsBody: "",
    };
    const vars = (raw.step_vars && typeof raw.step_vars === "object") ? raw.step_vars as Record<string, unknown> : {};
    if (F.isSequenceStep(step)) {
      const built = F.sequenceSms(step, {
        firstName: row.firstName,
        projectSummary: row.projectSummary,
        quoteTotal: vars.quoteTotal,
        visitAt: vars.visitAt,
        address: vars.address,
        installDate: vars.installDate,
        surveyUrl: survey,
        includeStop: vars.includeStop === true,
        outcome: row.outcome,
      });
      if (!built.ok) {
        await admin.from("job_followups").update({
          status: "skipped", last_error: built.reason || "missing", updated_at: new Date().toISOString(),
        }).eq("id", raw.id).eq("status", "sending");
        counts.skipped = (counts.skipped || 0) + 1;
        continue;
      }
      row.smsBody = built.text;
    } else {
      row.smsBody = F.followupSms(row);
    }
    const decision = F.decideDispatch({ settings: flags, row, env: runtimeEnv });
    if (decision.action === "dry_run") {
      await admin.from("job_followups").update({
        status: "dry_run", dry_run: true, sms_body: row.smsBody, last_error: null, updated_at: new Date().toISOString(),
      }).eq("id", raw.id).eq("status", "sending");
      await admin.from("followup_events").insert({
        followup_id: raw.id, job_id: raw.job_id, kind: "dry_run", detail: decision.log || {},
      });
      counts.dry_run = (counts.dry_run || 0) + 1;
      continue;
    }
    if (decision.action !== "send") {
      const status = decision.status || "failed";
      await admin.from("job_followups").update({
        status, last_error: decision.reason || status, updated_at: new Date().toISOString(),
      }).eq("id", raw.id).eq("status", "sending");
      await admin.from("followup_events").insert({
        followup_id: raw.id, job_id: raw.job_id, kind: status, detail: { reason: decision.reason || status },
      });
      counts[status] = (counts[status] || 0) + 1;
      continue;
    }

    const provider = decision.channel === "voice" ? "retell" : (F.smsProvider(runtimeEnv) || "retell");
    const request = decision.request;
    let providerRef = "";
    let failed = "";
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: providerHeaders(request, provider),
        body: request.bodyEncoding === "form" ? request.form : JSON.stringify(request.json),
      });
      const text = await res.text();
      let parsed: Record<string, unknown> = {};
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
      if (!res.ok) failed = String(parsed.message || parsed.error || res.status);
      else providerRef = String(parsed.chat_id || parsed.call_id || parsed.sid || "");
    } catch (err) {
      failed = err instanceof Error ? err.message : "network";
    }
    if (failed || !providerRef) {
      await admin.from("job_followups").update({
        status: "failed", last_error: (failed || "no provider id").slice(0, 500), sms_body: row.smsBody, updated_at: new Date().toISOString(),
      }).eq("id", raw.id).eq("status", "sending");
      await admin.from("followup_events").insert({
        followup_id: raw.id, job_id: raw.job_id, kind: "failed", detail: { reason: (failed || "no provider id").slice(0, 300) },
      });
      counts.failed = (counts.failed || 0) + 1;
      continue;
    }
    await admin.from("job_followups").update({
      status: "sent", provider, provider_ref: providerRef, sent_at: new Date().toISOString(),
      sms_body: row.smsBody, last_error: null, dry_run: false, updated_at: new Date().toISOString(),
    }).eq("id", raw.id).eq("status", "sending");
    counts.sent = (counts.sent || 0) + 1;
  }

  return json(200, { ok: true, counts });
});
