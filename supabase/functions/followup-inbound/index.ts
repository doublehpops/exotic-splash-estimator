// Inbound follow-up replies. Deploy with JWT verification off.
// Retell is checked with X-Retell-Signature and RETELL_API_KEY (raw body + timestamp).
// Twilio is checked with X-Twilio-Signature and TWILIO_AUTH_TOKEN.
// STOP opts the number out. Nothing here places a call or sends a text.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { createHmac } from "node:crypto";
import "../_shared/followup-core.js";

// deno-lint-ignore no-explicit-any
const F = (globalThis as any).EsFollowup;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function hmacSha256Hex(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}
function hmacSha1B64(key: string, data: string): string {
  return createHmac("sha1", key).update(data).digest("base64");
}

function publicUrl(req: Request): string {
  const incoming = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || incoming.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || incoming.host;
  return proto + "://" + host + incoming.pathname;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return json(500, { ok: false, error: "Not configured" });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const raw = await req.text();
  const retellSig = req.headers.get("x-retell-signature");
  const twilioSig = req.headers.get("x-twilio-signature");
  let provider = "";
  let messages: Array<{ id: string; body: string; from: string; provider: string }> = [];
  let followupId = "";
  let phones: string[] = [];
  let callStatus = "";
  let transcriptSummary = "";
  let analysis: unknown = null;

  if (retellSig) {
    const apiKey = Deno.env.get("RETELL_API_KEY") ?? "";
    if (!F.verifyRetellSignature(raw, apiKey, retellSig, Date.now(), hmacSha256Hex)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }
    let payload: unknown = {};
    try { payload = JSON.parse(raw); } catch { return json(400, { ok: false, error: "Invalid JSON" }); }
    const parsed = F.retellEvents(payload);
    provider = "retell";
    messages = parsed.messages || [];
    followupId = parsed.followupId || "";
    phones = parsed.phones || [];
    callStatus = parsed.callStatus || "";
    transcriptSummary = parsed.transcriptSummary || "";
    analysis = parsed.analysis;
  } else if (twilioSig) {
    const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
    const params: Record<string, string> = {};
    const form = new URLSearchParams(raw);
    for (const [k, v] of form.entries()) params[k] = v;
    if (!F.verifyTwilioSignature(publicUrl(req), params, token, twilioSig, hmacSha1B64)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }
    provider = "twilio";
    const from = F.toE164(params.From || "");
    phones = from ? [from] : [];
    messages = [{
      id: params.MessageSid || params.SmsSid || "",
      body: params.Body || "",
      from,
      provider: "twilio",
    }];
  } else {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  let row: Record<string, unknown> | null = null;
  if (followupId) {
    const found = await admin.from("job_followups").select("*").eq("id", followupId).maybeSingle();
    row = found.data;
  }
  if (!row && phones.length) {
    const found = await admin.from("job_followups").select("*").in("phone_e164", phones)
      .order("created_at", { ascending: false }).limit(1);
    row = (found.data && found.data[0]) || null;
  }
  if (!row) return json(200, { ok: true, stored: false });

  const local = {
    id: row.id,
    status: row.status,
    optedOut: !!row.opted_out_at,
    optedOutAt: row.opted_out_at,
    inboundReplies: row.inbound_replies || [],
  };
  let opted = false;
  for (const message of messages) {
    if (!String(message.body || "").trim()) continue;
    const applied = F.recordInbound(local, message);
    if (applied.optedOut) opted = true;
  }
  const patch: Record<string, unknown> = {
    inbound_replies: local.inboundReplies,
    updated_at: new Date().toISOString(),
  };
  if (callStatus) patch.call_status = callStatus;
  if (transcriptSummary) patch.transcript_summary = transcriptSummary;
  if (analysis && typeof analysis === "object") patch.call_analysis = analysis;
  if (opted) {
    patch.status = "opted_out";
    patch.opted_out_at = local.optedOutAt || new Date().toISOString();
    const phone = String(row.phone_e164 || phones[0] || "");
    if (phone) {
      await admin.from("followup_opt_outs").upsert({
        phone_e164: phone,
        source: provider,
        followup_id: row.id,
        opted_out_at: patch.opted_out_at,
      });
      await admin.from("job_followups").update({
        status: "opted_out",
        opted_out_at: patch.opted_out_at,
        updated_at: patch.updated_at,
      }).eq("phone_e164", phone).in("status", ["scheduled", "failed", "sending", "dry_run"]);
    }
  }
  await admin.from("job_followups").update(patch).eq("id", row.id);
  await admin.from("followup_events").insert({
    followup_id: row.id,
    job_id: row.job_id,
    kind: opted ? "opt_out" : "inbound",
    detail: { provider, messages: messages.map((m) => ({ id: m.id })) },
  });
  return json(200, { ok: true, stored: true });
});
