// Exotic Splash quote-job. Secrets come from SUPABASE_URL, SUPABASE_ANON_KEY,
// and SUPABASE_SERVICE_ROLE_KEY injected by the platform. They are not in this file.
// Discount decisions go through public RPCs on the caller's JWT, not the service role.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import "../_shared/discount-approval.js";
import "../_shared/epoxy-engine.js";
import "../_shared/quote-core.js";

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const E = g.EpoxyEngine;
const Q = g.EsQuoteCore;

const ALLOWED_ORIGINS = (Deno.env.get("ES_ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.length === 0 ? "" : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allow) h["Access-Control-Allow-Origin"] = allow;
  return h;
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function rpcFail(error: { message?: string; code?: string }) {
  const msg = error?.message || "Request failed";
  const code = error?.code || "";
  if (code === "42501") return { ok: false, status: 403, code: "forbidden", error: msg };
  if (code === "22023") return { ok: false, status: 400, code: "invalid_reduction", error: msg };
  if (code === "P0002") return { ok: false, status: 404, code: "not_found", error: msg };
  if (code === "40001") {
    let name = "conflict";
    if (/different estimate/i.test(msg)) name = "cross_estimate";
    else if (/already applied/i.test(msg)) name = "replay";
    else if (/changed after approval|approval is stale/i.test(msg)) name = "stale_approval";
    else if (/amount cannot/i.test(msg)) name = "tamper";
    else if (/pending/i.test(msg)) name = "pending";
    else if (/rejected/i.test(msg)) name = "rejected";
    return { ok: false, status: 409, code: name, error: msg };
  }
  return { ok: false, status: 400, code: "bad_request", error: msg };
}

function discountStore(userClient: ReturnType<typeof createClient>) {
  return {
    async request(_actor: unknown, input: Record<string, unknown>) {
      const { data, error } = await userClient.rpc("request_extra_discount", {
        p_estimate_id: input.estimateId,
        p_revision: input.revision,
        p_tier: input.tier,
        p_before_total: input.beforeTotal,
        p_amount: input.amount ?? null,
        p_percent: input.percent ?? null,
        p_reason: input.reason,
      });
      if (error) return rpcFail(error);
      return { ok: true, status: 200, request: data };
    },
    async decide(_actor: unknown, input: Record<string, unknown>) {
      const { data, error } = await userClient.rpc("decide_extra_discount", {
        p_id: input.id,
        p_decision: input.decision,
        p_amount: input.amount ?? null,
        p_low_margin_exception: input.lowMarginException === true,
        p_owner_note: input.ownerNote ?? null,
      });
      if (error) return rpcFail(error);
      return { ok: true, status: 200, request: data };
    },
    async check(input: Record<string, unknown>) {
      const { data, error } = await userClient.rpc("bind_extra_discount", {
        p_id: input.id,
        p_estimate_id: input.estimateId,
        p_revision: input.revision,
        p_tier: input.tier,
        p_before_total: input.beforeTotal,
        p_consume: false,
        p_mark_stale: input.markStale === true,
      });
      if (error) return rpcFail(error);
      if (data && data.ok === false) return { ok: false, status: 409, code: data.code, error: data.error };
      return { ok: true, status: 200, amount: data.amount, beforeTotal: data.beforeTotal, afterTotal: data.afterTotal, id: data.id, request: data };
    },
    async consume(_actor: unknown, input: Record<string, unknown>) {
      const { data, error } = await userClient.rpc("bind_extra_discount", {
        p_id: input.id,
        p_estimate_id: input.estimateId,
        p_revision: input.revision,
        p_tier: input.tier,
        p_before_total: input.beforeTotal,
        p_consume: true,
        p_mark_stale: true,
      });
      if (error) return rpcFail(error);
      if (data && data.ok === false) return { ok: false, status: 409, code: data.code, error: data.error };
      return { ok: true, status: 200, amount: data.amount, request: data };
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(req, 500, { ok: false, error: "Function not configured" });

  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(auth)) return json(req, 401, { ok: false, error: "Sign in required" });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(req, 401, { ok: false, error: "Session invalid or expired" });

  const adminClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: unknown;
  try { body = await req.json(); } catch { return json(req, 400, { ok: false, error: "Invalid JSON" }); }

  const deps = {
    discountStore: discountStore(userClient),
    async getProfile() {
      const { data, error } = await userClient.rpc("get_my_profile");
      if (error) throw error;
      const p = Array.isArray(data) ? data[0] : data;
      return p && p.id === userData.user.id ? p : null;
    },
    async getJob(id: string) {
      const { data, error } = await userClient.from("jobs").select("id, version, job_data").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async getPriceBook() {
      const [{ data: pb, error: e1 }, { data: pbo, error: e2 }] = await Promise.all([
        adminClient.from("price_book").select("staff_settings, version").eq("id", 1).single(),
        adminClient.from("price_book_owner").select("owner_settings").eq("id", 1).single(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { staff_settings: pb.staff_settings, owner_settings: pbo.owner_settings, version: pb.version };
    },
    async getJobMarkup(id: string) {
      const { data, error } = await adminClient.from("job_owner_pricing").select("markup_pct").eq("job_id", id).maybeSingle();
      if (error) throw error;
      return data ? Number(data.markup_pct) : null;
    },
    async recordQuote(args: Record<string, unknown>) {
      const { data, error } = await adminClient.rpc("server_record_quote", args);
      if (error) throw new Error(error.message);
      return data;
    },
  };

  const result = await Q.handleQuoteRequest(body, deps, E);
  return json(req, result.status, result.body);
});
