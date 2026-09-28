// The ERP assistant: Claude answers questions using the signed-in user's own data.
//
// Every lookup the model makes runs through the database API with the *user's* access token, so the
// same row-level security that protects the app decides what the assistant can see. It can read,
// never write. Plain fetch only (no imports), so it runs on Supabase Edge (Deno) and under Node for tests.

export type Env = {
  ANTHROPIC_API_KEY?: string;
  ASSISTANT_MODEL?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};
type Msg = { role: "user" | "assistant"; content: unknown };
type Source = { kind: "table" | "function"; name: string; rows: number };

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_ROUNDS = 8;
const MAX_RESULT_CHARS = 24_000;

// What the model may read (all subject to the user's permissions), with the columns worth knowing.
const TABLES: Record<string, string> = {
  profiles: "id, full_name, role, email, active",
  classes: "id, name, code, teacher_id, teacher_name, room, days ('Mon,Wed'), start_time, end_time, term_id, capacity, course_id",
  class_enrollments: "class_id, student_id, student_name, status (enrolled|waitlisted|dropped|completed), final_grade",
  attendance: "class_id, student_id, student_name, session_date, status (Present|Absent|Late|Excused), note",
  assessments: "id, class_id, title, category, max_points, weight, due_date",
  grades: "assessment_id, student_id, score, comment",
  course_materials: "id, class_id, title, file_type (Assignment|Lecture|…), due_date",
  assignment_submissions: "material_id, student_id, submitted_at, grade",
  announcements: "title, body, audience, created_at, author_name",
  calendar_events: "title, event_date, category",
  exams: "course_name, exam_date, location, status",
  student_balances: "student_id, balance (positive = amount owed)",
  ledger_entries: "account_id, entry_type (charge|payment|aid|adjustment|refund), amount, description, method, created_at",
  student_accounts: "id, student_id, hold, hold_reason",
  payment_intents: "student_id, amount, method, status, gateway_ref, created_at",
  terms: "id, name, starts_on, ends_on, add_drop_deadline, is_current",
  courses: "id, code, title, credits, prerequisites",
  programs: "id, name, degree_type, total_credits",
  student_risk_scores: "student_id, score (0-100), level (low|medium|high), factors (attendance_rate, grade_average, …)",
  interventions: "id, student_id, mentor_id, reason, goal, status, outcome, opened_at",
  intervention_actions: "intervention_id, kind, note, due_on, done_at",
  guardian_links: "guardian_id, student_id, relationship",
  leave_requests: "requester_name, start_date, end_date, status, reason",
  library_loans: "book_id, borrower_id, due_date, returned_at",
  library_books: "id, title, author, copies_available",
  transport_routes: "id, name, driver_id, departure_time, status",
  transport_stops: "route_id, seq, name, lat, lng",
  transport_subscriptions: "route_id, rider_id, stop_id",
  bus_locations: "route_id, lat, lng, speed_kmh, trip_active, updated_at",
  cover_assignments: "class_id, cover_date, substitute_id",
  badge_awards: "badge_id, student_id, issued_at, verification_code, revoked",
  badges: "id, name, description, skills",
  campus_events: "title, event_date, location, capacity",
  clubs: "name, category, description",
  tasks: "title, status, due_date, assignee",
  notifications: "title, body, created_at, read_at",
};
// Read-only database functions the model may call.
const FUNCTIONS: Record<string, string> = {
  degree_audit: "{p_student: uuid} → credits done/needed and outstanding requirements for a student",
  intervention_impact: "{p_id: uuid} → attendance and grades before vs. since an intervention opened",
  my_hall_tickets: "{} → the signed-in student's exam seats and results",
  section_seats: "{} → enrolled and waitlisted counts per class",
};

const tools = [
  {
    name: "query_table",
    description: "Read rows from one ERP table. Only rows this user is allowed to see are returned. Use filters to stay precise.",
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string", enum: Object.keys(TABLES) },
        select: { type: "string", description: "Comma-separated columns, default *" },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "ilike", "in", "is"] },
              value: { type: "string", description: "For 'in' a comma-separated list; for 'ilike' plain text (matched anywhere); for 'is' null/true/false" },
            },
            required: ["column", "op", "value"],
          },
        },
        order: { type: "string", description: "column, optionally followed by .desc" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: ["table"],
    },
  },
  {
    name: "call_function",
    description: "Call a read-only ERP function.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", enum: Object.keys(FUNCTIONS) }, args: { type: "object" } },
      required: ["name"],
    },
  },
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const IDENT = /^[a-z_][a-z0-9_]*$/;
const SELECT = /^[a-z0-9_,*() :!.]+$/i;

export async function runTool(name: string, input: Record<string, unknown>, ctx: { url: string; anon: string; token: string; fetch: typeof fetch }) {
  const headers = { apikey: ctx.anon, Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" };
  if (name === "query_table") {
    const table = String(input.table ?? "");
    if (!(table in TABLES)) return { error: `Unknown table ${table}` };
    const select = String(input.select ?? "*");
    if (!SELECT.test(select)) return { error: "Invalid select" };
    const qs = new URLSearchParams({ select });
    for (const f of (input.filters as { column: string; op: string; value: string }[] | undefined) ?? []) {
      if (!IDENT.test(f.column)) return { error: `Invalid column ${f.column}` };
      const v = String(f.value);
      const val = f.op === "in" ? `in.(${v.split(",").map((x) => `"${x.trim().replace(/"/g, "")}"`).join(",")})`
        : f.op === "ilike" ? `ilike.*${v.replace(/[*%]/g, "")}*`
        : `${f.op}.${v}`;
      qs.append(f.column, val);
    }
    if (input.order) {
      const [col, dir] = String(input.order).split(".");
      if (!IDENT.test(col)) return { error: "Invalid order" };
      qs.set("order", `${col}.${dir === "desc" ? "desc" : "asc"}`);
    }
    qs.set("limit", String(Math.min(Number(input.limit ?? 50), 200)));
    const res = await ctx.fetch(`${ctx.url}/rest/v1/${table}?${qs}`, { headers });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: (body as { message?: string })?.message ?? `HTTP ${res.status}` };
    return { rows: body as unknown[] };
  }
  if (name === "call_function") {
    const fn = String(input.name ?? "");
    if (!(fn in FUNCTIONS)) return { error: `Unknown function ${fn}` };
    const res = await ctx.fetch(`${ctx.url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(input.args ?? {}) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: (body as { message?: string })?.message ?? `HTTP ${res.status}` };
    return { rows: Array.isArray(body) ? body : [body] };
  }
  return { error: `Unknown tool ${name}` };
}

const LANG_NAME: Record<string, string> = { en: "English", hi: "Hindi", bn: "Bengali" };

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);
  const url = env.SUPABASE_URL ?? "";
  const anon = env.SUPABASE_ANON_KEY ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token === anon) return json({ error: "Sign in first." }, 401);

  // Who is asking (the token is verified by the auth server).
  const who = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!who.ok) return json({ error: "Sign in first." }, 401);
  const user = (await who.json()) as { id: string };
  const ctx = { url, anon, token, fetch: fetchImpl };
  const me = await runTool("query_table", { table: "profiles", select: "id,full_name,role", filters: [{ column: "id", op: "eq", value: user.id }] }, ctx);
  const profile = ((me as { rows?: { full_name: string; role: string }[] }).rows ?? [])[0];
  if (!profile) return json({ error: "Your account is not active yet." }, 403);

  const body = (await req.json().catch(() => ({}))) as { messages?: Msg[]; lang?: string };
  const history = (body.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12);
  if (!history.length || history[history.length - 1].role !== "user") return json({ error: "Ask a question." }, 400);
  if (String(history[history.length - 1].content).length > 4000) return json({ error: "That question is too long." }, 400);

  const now = new Date();
  const system = [
    `You are the assistant inside "All-In-One ERP", a school management system. You are talking to ${profile.full_name} (role: ${profile.role}, user id ${user.id}).`,
    `Today is ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString("en-GB", { weekday: "long" })}).`,
    "Use the tools to look up facts before answering; never guess names, numbers, dates or grades. The tools only return what this user is permitted to see — if something is missing, say you can't see it rather than assuming it doesn't exist.",
    "You can read but not change anything. If asked to change data, explain where in the app to do it.",
    "Drafting is welcome (messages to parents, report-card comments, summaries) — base drafts on the data you looked up.",
    "Be concise and practical. Use short lists for several items. Money is in the school's currency; dates as '12 Mar'.",
    `Answer in ${LANG_NAME[body.lang ?? "en"] ?? "English"}.`,
    "Tables you can read: " + Object.entries(TABLES).map(([t, c]) => `${t}(${c})`).join("; "),
    "Functions: " + Object.entries(FUNCTIONS).map(([f, d]) => `${f} ${d}`).join("; "),
  ].join("\n");

  const messages: Msg[] = history.map((m) => ({ role: m.role, content: m.content }));
  const sources: Source[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env.ASSISTANT_MODEL || DEFAULT_MODEL, max_tokens: 2048, system, tools, messages }),
    });
    if (!res.ok) {
      const err = await res.text();
      return json({ error: res.status === 429 ? "The assistant is busy. Try again in a minute." : "The assistant is unavailable right now.", detail: err.slice(0, 300) }, 502);
    }
    const out = (await res.json()) as { stop_reason: string; content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[] };
    messages.push({ role: "assistant", content: out.content });
    const calls = out.content.filter((c) => c.type === "tool_use");
    if (out.stop_reason !== "tool_use" || !calls.length) {
      const reply = out.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      return json({ reply, sources });
    }
    const results = [];
    for (const c of calls) {
      const r = await runTool(c.name!, c.input ?? {}, ctx);
      const rows = (r as { rows?: unknown[] }).rows;
      sources.push({ kind: c.name === "call_function" ? "function" : "table", name: String(c.input?.table ?? c.input?.name ?? c.name), rows: rows?.length ?? 0 });
      let text = JSON.stringify(r);
      if (text.length > MAX_RESULT_CHARS) text = text.slice(0, MAX_RESULT_CHARS) + "…(truncated — narrow the query)";
      results.push({ type: "tool_result", tool_use_id: c.id, content: text, is_error: "error" in r });
    }
    messages.push({ role: "user", content: results });
  }
  return json({ reply: "That needed too many lookups. Try a more specific question.", sources });
}
