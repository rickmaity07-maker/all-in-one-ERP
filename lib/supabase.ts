import { createClient } from '@supabase/supabase-js';

// We added the actual strings as fallbacks so it works even if the .env file is hidden!
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iiaykofxmephkzvcshhj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpYXlrb2Z4bWVwaGt6dmNzaGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Nzc3MTk0MiwiZXhwIjoyMTAzMzQ3OTQyfQ.lVe-Jb4WKVQlwbNXW39q8jaNoQlSKt08OjaExtGzzj4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);