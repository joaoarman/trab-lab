import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'

// Placeholder do módulo — o propósito e as regras entram quando ele for detalhado.
// As queries vão em ./supabase.ts, retornando tipos de domínio de src/shared/data/model.ts.
export function CategoriasPage() {
  return <ModulePlaceholder stepKeys={['categories.placeholder.step1', 'categories.placeholder.step2', 'categories.placeholder.step3']} />
}
