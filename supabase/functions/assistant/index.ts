// ERP assistant (Claude) as a Supabase Edge Function.
//
// Deploy:  supabase functions deploy assistant
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        (required)
//          supabase secrets set ASSISTANT_MODEL=claude-opus-5-5      (optional)
//          (SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.)
//
// POST /functions/v1/assistant  {messages: [{role, content}], lang?: "en"|"hi"|"bn"}  with the user's Bearer token
//   -> {reply, sources: [{kind, name, rows}]}   or 503 {error: "not_configured"} until the key is set.

import { handle } from "./handler.ts";

declare const Deno: { env: { toObject(): Record<string, string> }; serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve((req) => handle(req, Deno.env.toObject()));
