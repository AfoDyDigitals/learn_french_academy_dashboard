import { createClient } from '@supabase/supabase-js'

// The publishable key is designed to be public: data is protected by row level security.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://jlbpjwgyfdulkjbdhfuf.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_fQ2Ez10s3w_T1cXMmmnl_Q_5V6X1PuX'

export const sb = createClient(url, key)
