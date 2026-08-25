import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'

// Placeholder do módulo — o propósito e as regras entram quando ele for detalhado.
// As queries vão em ./supabase.ts, retornando tipos de domínio de src/shared/data/model.ts.
export function LogPage() {
  return <ModulePlaceholder stepKeys={['log.placeholder.step1', 'log.placeholder.step2', 'log.placeholder.step3']} />
}
