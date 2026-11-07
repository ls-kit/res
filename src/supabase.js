import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('[RCR] Supabase URL বা KEY নেই। .env ফাইল চেক করুন।')
}

export const supabase = createClient(url, key)