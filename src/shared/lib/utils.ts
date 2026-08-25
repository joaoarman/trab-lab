import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Junta classes do Tailwind resolvendo CONFLITO — a última vence de verdade.
 *
 * `clsx` monta a string a partir de condicionais; `twMerge` remove o que foi
 * sobrescrito (`px-2 px-4` vira `px-4`). É o que permite um componente base
 * definir o padrão e quem o usa trocar só uma parte, sem depender da ordem em
 * que o CSS foi gerado.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
