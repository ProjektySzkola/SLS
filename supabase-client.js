import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// ← Zamień te dwie wartości na swoje dane z Supabase Dashboard
// Dashboard → Settings → API
const SUPABASE_URL = 'https://fzruwhuxbeqcbpkrxxjr.supabase.co';
// NIE JESTEM PEWNY CZY TO JEST TO CZEGO POTRZEBUJE
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cnV3aHV4YmVxY2Jwa3J4eGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDIzNzQsImV4cCI6MjA4ODExODM3NH0.Mx6tLkNlfxblGheQoq4Sil5db-1Eh3Vf-FfMZtuSSrE';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);