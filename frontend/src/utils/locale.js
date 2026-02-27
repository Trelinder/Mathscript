const LANGUAGE_TO_LOCALE = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
}

export function localeFromLanguage(language) {
  return LANGUAGE_TO_LOCALE[(language || '').toLowerCase()] || LANGUAGE_TO_LOCALE.en
}

export function formatLocalizedNumber(value, language) {
  const numeric = Number(value || 0)
  try {
    return new Intl.NumberFormat(localeFromLanguage(language)).format(numeric)
  } catch {
    return String(numeric)
  }
}
