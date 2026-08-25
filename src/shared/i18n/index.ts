import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from './locales/pt-BR.json'
import en from './locales/en.json'

/**
 * Configuração única do i18n (react-i18next).
 *
 * Todo texto de UI passa por chave de tradução (`t('...')`) e os arquivos ficam
 * em `./locales/<idioma>.json` (um JSON por idioma). Números/datas/moeda: use os
 * helpers de `./format`.
 *
 * Idioma padrão: **pt-BR**. Segundo idioma: **en** — como há 2+, o shell mostra o
 * seletor de idioma (no menu do usuário).
 */
export const DEFAULT_LANGUAGE = 'pt-BR'

export const resources = {
  'pt-BR': { translation: ptBR },
  en: { translation: en },
} as const

/** Os idiomas disponíveis, na ordem em que o seletor os lista. */
export const LANGUAGES = [
  { code: 'pt-BR', labelKey: 'language.ptBR' },
  { code: 'en', labelKey: 'language.en' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

const STORAGE_KEY = 'selfos.language'

/**
 * O idioma com que o app abre: o que o usuário escolheu da última vez; se nunca
 * escolheu, o do navegador — e só então o padrão.
 *
 * O `localStorage` está dentro de try/catch porque ele **lança** (não devolve
 * vazio) em aba anônima do Safari e com cookies de terceiros bloqueados. Uma
 * exceção aqui aconteceria antes do React montar: o app inteiro ficaria numa
 * tela branca por causa da preferência de idioma.
 */
function idiomaInicial(): LanguageCode {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo && salvo in resources) return salvo as LanguageCode
  } catch {
    // Sem armazenamento: cai para o navegador / padrão.
  }
  // `navigator.language` vem como 'pt-BR', 'pt', 'en-US'… — comparamos só a raiz,
  // senão um usuário em 'en-GB' cairia no português.
  const doNavegador = navigator.language?.split('-')[0]
  return doNavegador === 'en' ? 'en' : DEFAULT_LANGUAGE
}

i18n.use(initReactI18next).init({
  resources,
  lng: idiomaInicial(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }, // o React já escapa contra XSS
  returnNull: false,
})

/**
 * Troca o idioma e o guarda para a próxima visita.
 *
 * Também atualiza o `lang` do `<html>`: é dele que dependem o corretor
 * ortográfico do campo de escrever do chat, a leitura por leitores de tela e a
 * separação silábica — nada disso olha o estado do React.
 */
export function setLanguage(code: LanguageCode) {
  void i18n.changeLanguage(code)
  document.documentElement.lang = code
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Sem armazenamento: a escolha vale só nesta sessão.
  }
}

document.documentElement.lang = i18n.language

export default i18n
