import { createClient } from '@supabase/supabase-js'

// Cliente Supabase do projeto. As chamadas reais ficam nos `supabase.ts` de cada
// módulo (em src/pages/<Módulo>/supabase.ts), retornando tipos de domínio.
const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey)
