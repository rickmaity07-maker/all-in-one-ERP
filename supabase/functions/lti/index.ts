// LTI 1.3 platform (tool launch) for the ERP, as a Supabase Edge Function.
//
// Deploy:  supabase functions deploy lti --no-verify-jwt
// Secrets: supabase secrets set LTI_PRIVATE_KEY="$(cat lti-private.pem)"   (RSA PKCS#8 PEM, 2048+ bits)
//          (SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.)
//
// Routes (all under /functions/v1/lti):
//   GET  /jwks   public keyset tools use to verify our id_tokens
//   POST /start  {tool, class?} with the user's Bearer token -> { url } to open (OIDC third-party login)
//   GET|POST /auth  the tool's OIDC authorization request -> auto-posting form with the signed id_token
//
// The user's access token never appears in a URL: /start exchanges it for a 5-minute signed login_hint.

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ISSUER = `${SUPABASE_URL}/functions/v1/lti`;
const KID = "erp-lti-1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

let keys: Promise<{ priv: CryptoKey; jwk: JsonWebKey }> | null = null;
function loadKeys() {
  keys ??= (async () => {
    const pem = Deno.env.get("LTI_PRIVATE_KEY");
    if (!pem) throw new Error("LTI_PRIVATE_KEY is not set");
    const der = fromB64url(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "").replace(/=+$/, ""));
    const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const priv = await crypto.subtle.importKey("pkcs8", der, alg, true, ["sign"]);
    const full = await crypto.subtle.exportKey("jwk", priv);
    const jwk: JsonWebKey = { kty: "RSA", n: full.n, e: full.e, alg: "RS256", use: "sig", kid: KID } as JsonWebKey;
    return { priv, jwk };
  })();
  return keys;
}

async function sign(payload: Record<string, unknown>) {
  const { priv } = await loadKeys();
  const input = `${b64urlJson({ alg: "RS256", typ: "JWT", kid: KID })}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", priv, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

async function verify(token: string): Promise<Record<string, unknown> | null> {
  const { jwk } = await loadKeys();
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const pub = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pub, fromB64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  return typeof claims.exp === "number" && claims.exp > Date.now() / 1000 ? claims : null;
}

// PostgREST call as the signed-in user, so row-level security decides what they may launch.
async function rest(path: string, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const ROLE_URIS: Record<string, string[]> = {
  student: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
  teacher: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"],
  administration: ["http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator", "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"],
  owner: ["http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator", "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"],
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/lti/, "") || "/";

  try {
    if (route === "/jwks") {
      const { jwk } = await loadKeys();
      return json({ keys: [jwk] });
    }

    if (route === "/start" && req.method === "POST") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
      if (!userRes.ok) return json({ error: "Sign in first." }, 401);
      const user = await userRes.json();
      const { tool: toolId, class: classId } = await req.json();
      const [tool] = await rest(`lti_tools?id=eq.${encodeURIComponent(toolId)}&enabled=eq.true&select=*`, token);
      if (!tool) return json({ error: "Unknown or disabled tool." }, 404);
      const [profile] = await rest(`profiles?id=eq.${user.id}&select=full_name,role`, token);
      let context: Record<string, unknown> | null = null;
      if (classId) {
        const [cls] = await rest(`classes?id=eq.${encodeURIComponent(classId)}&select=id,name,subject`, token);
        if (!cls) return json({ error: "You do not have access to that class." }, 403);
        context = { id: cls.id, label: cls.subject ?? cls.name, title: cls.name, type: ["http://purl.imsglobal.org/vocab/lis/v2/course#CourseSection"] };
      }
      const now = Math.floor(Date.now() / 1000);
      const hint = await sign({ typ: "login_hint", sub: user.id, name: profile?.full_name, role: profile?.role, email: user.email, tool: tool.id, context, iat: now, exp: now + 300 });
      const target = tool.login_url || tool.launch_url;
      const params = new URLSearchParams({ iss: ISSUER, login_hint: hint, target_link_uri: tool.launch_url, client_id: tool.client_id, lti_deployment_id: tool.deployment_id });
      if (tool.login_url) return json({ url: `${target}?${params}` });
      // Tools without a login initiation URL: skip straight to our auth step.
      return json({ url: `${ISSUER}/auth?${new URLSearchParams({ client_id: tool.client_id, login_hint: hint, redirect_uri: tool.launch_url, nonce: crypto.randomUUID(), state: crypto.randomUUID(), response_type: "id_token", response_mode: "form_post", scope: "openid", prompt: "none" })}` });
    }

    if (route === "/auth") {
      const q = req.method === "POST" ? new URLSearchParams(await req.text()) : url.searchParams;
      const hint = await verify(q.get("login_hint") ?? "");
      if (!hint || hint.typ !== "login_hint") return new Response("Launch expired — start it again from the ERP.", { status: 401 });
      if (q.get("response_type") !== "id_token" || q.get("scope") !== "openid" || !q.get("nonce")) return new Response("Invalid OIDC request.", { status: 400 });
      // The hint is signed by us, so its tool id is trusted; lti_tool_public exposes only non-secret launch details.
      const redirect = q.get("redirect_uri") ?? "";
      const toolRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/lti_tool_public?p_id=${encodeURIComponent(String(hint.tool))}`, { headers: { apikey: ANON_KEY } });
      const tool = toolRes.ok ? await toolRes.json() : null;
      if (!tool || tool.client_id !== q.get("client_id") || redirect !== tool.launch_url) return new Response("redirect_uri or client_id does not match the registered tool.", { status: 400 });
      const now = Math.floor(Date.now() / 1000);
      const idToken = await sign({
        iss: ISSUER, aud: tool.client_id, sub: hint.sub, iat: now, exp: now + 300, nonce: q.get("nonce"),
        name: hint.name, email: hint.email,
        "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiResourceLinkRequest",
        "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
        "https://purl.imsglobal.org/spec/lti/claim/deployment_id": tool.deployment_id,
        "https://purl.imsglobal.org/spec/lti/claim/target_link_uri": tool.launch_url,
        "https://purl.imsglobal.org/spec/lti/claim/resource_link": { id: `${tool.id}:${(hint.context as { id?: string } | null)?.id ?? "global"}` },
        "https://purl.imsglobal.org/spec/lti/claim/roles": ROLE_URIS[String(hint.role)] ?? [],
        ...(hint.context ? { "https://purl.imsglobal.org/spec/lti/claim/context": hint.context } : {}),
        "https://purl.imsglobal.org/spec/lti/claim/tool_platform": { guid: ISSUER, name: "All-In-One ERP", product_family_code: "all-in-one-erp" },
      });
      const html = `<!doctype html><html><body onload="document.forms[0].submit()"><form method="post" action="${escape(redirect)}">
        <input type="hidden" name="id_token" value="${escape(idToken)}"/><input type="hidden" name="state" value="${escape(q.get("state") ?? "")}"/>
        <noscript><button>Continue</button></noscript></form></body></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
