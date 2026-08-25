import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'

// Placeholder do módulo — o propósito e as regras entram quando ele for detalhado.
// As queries vão em ./supabase.ts, retornando tipos de domínio de src/shared/data/model.ts.
export function ReceitasPage() {
  return <ModulePlaceholder stepKeys={['income.placeholder.step1', 'income.placeholder.step2', 'income.placeholder.step3']} />
}
