// Service "i18n": texts of the answers (setting "language").
const TEXT = {
  en: {
    'quick.footer': 'Translated from {from} by DeepL · requested by {user}',
    'quick.original': 'Original message',
    'cmd.title': '{flag} {to}',
    'cmd.original': 'Original ({from})',
    'cmd.translation': 'Translation',
    'err.key': 'The DeepL key is missing or wrong. Add DEEPL_API_KEY under Admin → API / Secrets (value: "DeepL-Auth-Key <your key>") and share it with this plugin.',
    'err.api': 'DeepL did not answer. Try again later.',
    'err.quota': 'The DeepL character quota of this month is used up.',
    'err.busy': 'Too many translations right now. Try again in a moment.',
    'err.limit': 'The daily translation limit of this server is reached.',
    'err.language': 'Unknown language "{lang}". Use a code like DE, EN-US, FR or a name like German.',
    'err.empty': 'There is no text to translate.',
    'err.long': 'The text is too long (at most {max} characters).',
  },
  de: {
    'quick.footer': 'Übersetzt aus {from} von DeepL · angefragt von {user}',
    'quick.original': 'Originalnachricht',
    'cmd.title': '{flag} {to}',
    'cmd.original': 'Original ({from})',
    'cmd.translation': 'Übersetzung',
    'err.key': 'Der DeepL-Schlüssel fehlt oder ist falsch. Trage DEEPL_API_KEY unter Admin → API / Secrets ein (Wert: „DeepL-Auth-Key <dein Schlüssel>“) und gib ihn für dieses Plugin frei.',
    'err.api': 'DeepL hat nicht geantwortet. Versuch es später noch mal.',
    'err.quota': 'Das DeepL-Zeichenkontingent dieses Monats ist aufgebraucht.',
    'err.busy': 'Gerade zu viele Übersetzungen. Versuch es gleich noch mal.',
    'err.limit': 'Das tägliche Übersetzungslimit dieses Servers ist erreicht.',
    'err.language': 'Unbekannte Sprache „{lang}“. Nimm einen Code wie DE, EN-US, FR oder einen Namen wie German.',
    'err.empty': 'Es gibt keinen Text zum Übersetzen.',
    'err.long': 'Der Text ist zu lang (höchstens {max} Zeichen).',
  },
};

export function t(lang, key, params = {}) {
  const text = TEXT[lang]?.[key] ?? TEXT.en[key] ?? key;
  return String(text).replace(/\{(\w+)\}/g, (all, k) => (k in params ? String(params[k]) : all));
}
