import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from './locales/pt-BR.json'
import en from './locales/en.json'

export const DEFAULT_LANGUAGE = 'pt-BR'

export const resources = {
  'pt-BR': { translation: ptBR },
  en: { translation: en },
} as const

export const LANGUAGES = [
  { code: 'pt-BR', labelKey: 'language.ptBR' },
  { code: 'en', labelKey: 'language.en' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

const STORAGE_KEY = 'selfos.language'

function idiomaInicial(): LanguageCode {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo && salvo in resources) return salvo as LanguageCode
  } catch {
    // localStorage bloqueado: cai no idioma do navegador
  }
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

export function setLanguage(code: LanguageCode) {
  void i18n.changeLanguage(code)
  document.documentElement.lang = code
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // localStorage bloqueado: o idioma vale só nesta aba
  }
}

document.documentElement.lang = i18n.language

export default i18n
