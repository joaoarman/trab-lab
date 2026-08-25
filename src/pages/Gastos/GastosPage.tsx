import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'

// Placeholder do módulo — o propósito e as regras entram quando ele for detalhado.
// As queries vão em ./supabase.ts, retornando tipos de domínio de src/shared/data/model.ts.
export function GastosPage() {
  return <ModulePlaceholder stepKeys={['expenses.placeholder.step1', 'expenses.placeholder.step2', 'expenses.placeholder.step3']} />
}
