import { createClient } from '@supabase/supabase-js';

// We added the actual strings as fallbacks so it works even if the .env file is hidden!
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iiaykofxmephkzvcshhj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpYXlrb2Z4bWVwaGt6dmNzaGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzE5NDIsImV4cCI6MjEwMzM0Nzk0Mn0.lR2Qt5mtQMIM1jUWhMZuc-AuExHj1P3fZEb8Q5WmXcA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);