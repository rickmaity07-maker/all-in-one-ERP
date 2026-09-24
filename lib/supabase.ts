import { createClient } from '@supabase/supabase-js';

// Values are baked in at build time from .env.local (locally) or GitHub secrets (release builds).
// Only ever use the public "anon" key here — the service_role key must never ship inside the app.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
);
