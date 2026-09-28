// SMS / WhatsApp delivery through Twilio, as a Supabase Edge Function.
//
// Deploy:  supabase functions deploy send-messages --no-verify-jwt
// Secrets: supabase secrets set TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... \
//            TWILIO_SMS_FROM=+15551234567 TWILIO_WHATSAPP_FROM=+14155238886
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
// Then, in the SQL editor:
//   update public.private_settings set value = 'https://<project>.supabase.co/functions/v1' where key = 'functions_url';
//   update public.app_settings set value = 'true' where key = 'messaging_enabled';
// (pg_net and pg_cron must be enabled under Database → Extensions.)

import { handle } from "./handler.ts";

declare const Deno: { env: { toObject(): Record<string, string> }; serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve((req) => handle(req, Deno.env.toObject()));
