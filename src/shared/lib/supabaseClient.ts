import { createClient } from '@supabase/supabase-js'

// Cliente Supabase do projeto. As chamadas reais ficam nos `supabase.ts` de cada
// módulo (em src/pages/<Módulo>/supabase.ts), retornando tipos de domínio.
const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey, {
  auth: {
    /*
      PKCE, declarado de propósito.

      É o padrão do supabase-js v2, mas está escrito aqui para que trocá-lo seja
      uma decisão consciente, e não um efeito colateral de alguém "arrumando" as
      opções. No fluxo antigo (`implicit`), o token volta na URL do redirect e
      quem o interceptar consegue usá-lo. No PKCE volta um código que só serve
      acompanhado de um segredo que nunca saiu deste navegador.
    */
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
