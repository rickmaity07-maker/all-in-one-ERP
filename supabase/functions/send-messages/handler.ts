// Sends queued SMS / WhatsApp messages (public.message_outbox) through Twilio.
// Woken by the database when a message is queued, and every minute by pg_cron as a safety net.
// Plain fetch only, so it runs on Supabase Edge (Deno) and under Node for tests.

export type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_SMS_FROM?: string; // +15551234567 or a Messaging Service SID (MG…)
  TWILIO_WHATSAPP_FROM?: string; // +14155238886 (WhatsApp-enabled sender)
};
type Outbox = { id: string; channel: "sms" | "whatsapp"; to_number: string; body: string; attempts: number };

const MAX_ATTEMPTS = 5;

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = env.SUPABASE_URL ?? "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const db = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // Only the database may wake this function: it signs the request with a secret no API user can read.
  const secret = await fetchImpl(`${url}/rest/v1/private_settings?key=eq.functions_secret&select=value`, { headers: db })
    .then((r) => r.json() as Promise<{ value: string }[]>).then((r) => r[0]?.value).catch(() => undefined);
  if (!secret || req.headers.get("X-ERP-Secret") !== secret) return new Response("Forbidden", { status: 403 });

  const queued = (await fetchImpl(
    `${url}/rest/v1/message_outbox?status=eq.queued&attempts=lt.${MAX_ATTEMPTS}&order=created_at.asc&limit=50&select=id,channel,to_number,body,attempts`,
    { headers: db },
  ).then((r) => r.json())) as Outbox[];

  const patch = (id: string, values: Record<string, unknown>) =>
    fetchImpl(`${url}/rest/v1/message_outbox?id=eq.${id}`, { method: "PATCH", headers: db, body: JSON.stringify(values) });

  const configured = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN;
  let sent = 0;
  let failed = 0;
  for (const m of queued) {
    const from = m.channel === "whatsapp" ? env.TWILIO_WHATSAPP_FROM : env.TWILIO_SMS_FROM;
    if (!configured || !from) {
      await patch(m.id, { status: "not_configured", error: `${m.channel === "whatsapp" ? "WhatsApp" : "SMS"} sender is not set up.` });
      continue;
    }
    const form = new URLSearchParams({
      To: m.channel === "whatsapp" ? `whatsapp:${m.to_number}` : m.to_number,
      Body: m.body,
    });
    if (m.channel === "sms" && from.startsWith("MG")) form.set("MessagingServiceSid", from);
    else form.set("From", m.channel === "whatsapp" ? `whatsapp:${from}` : from);
    try {
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const out = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
      if (res.ok) {
        await patch(m.id, { status: "sent", provider: "twilio", provider_ref: out.sid ?? null, error: null, attempts: m.attempts + 1, sent_at: new Date().toISOString() });
        sent++;
      } else {
        // 4xx from Twilio (bad number, unverified recipient…) won't succeed on retry; 5xx / 429 may.
        const retry = res.status >= 500 || res.status === 429;
        await patch(m.id, {
          status: retry && m.attempts + 1 < MAX_ATTEMPTS ? "queued" : "failed",
          provider: "twilio",
          error: `${out.code ?? res.status}: ${out.message ?? "Twilio refused the message"}`.slice(0, 300),
          attempts: m.attempts + 1,
        });
        failed++;
      }
    } catch (e) {
      await patch(m.id, { status: m.attempts + 1 < MAX_ATTEMPTS ? "queued" : "failed", error: String((e as Error).message ?? e).slice(0, 300), attempts: m.attempts + 1 });
      failed++;
    }
  }
  return new Response(JSON.stringify({ processed: queued.length, sent, failed }), { headers: { "Content-Type": "application/json" } });
}
