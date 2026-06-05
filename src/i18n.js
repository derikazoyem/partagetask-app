// Cache des traductions déjà chargées
const cache = {}
let current = {}
let currentLang = 'fr'

export async function loadLang(lang) {
  if (cache[lang]) {
    current = cache[lang]
    currentLang = lang
    return current
  }
  try {
    const res = await fetch(`/langs/${lang}.json`)
    if (!res.ok) throw new Error(`Lang ${lang} not found`)
    const data = await res.json()
    cache[lang] = data
    current = data
    currentLang = lang
    return current
  } catch (e) {
    console.warn(`Failed to load lang ${lang}, fallback to fr`)
    if (lang !== 'fr') return loadLang('fr')
    return {}
  }
}

export function t(key) {
  return current[key] || key
}

export function getLang() {
  return currentLang
}

export function detectLang() {
  const saved = localStorage.getItem('pt_lang')
  if (saved && ['fr','en','es','ar','it'].includes(saved)) return saved
  const browser = (navigator.language || 'fr').substring(0, 2).toLowerCase()
  return ['fr','en','es','ar','it'].includes(browser) ? browser : 'fr'
}

export function applyTranslations() {
  // Mettre à jour tous les éléments avec un id t-*
  document.querySelectorAll('[id^="t-"]').forEach(el => {
    const key = el.id.replace('t-', '').replace(/-/g, '_')
    const val = current[key]
    if (val) el.textContent = val
  })

  // Placeholders
  const placeholders = {
    'login-email'  : current.lbl_email,
    'login-pw'     : current.lbl_password,
    'reg-name'     : current.lbl_name,
    'reg-email'    : current.lbl_email,
    'reg-pw'       : current.lbl_pw_min,
    'forgot-email' : current.lbl_email,
    'dep-desc'     : current.placeholder_desc,
    'dep-qty'      : '1',
    'dep-price'    : '0',
    'rec-desc'     : current.placeholder_desc,
    'rec-amount'   : '0',
  }
  Object.entries(placeholders).forEach(([id, val]) => {
    const el = document.getElementById(id)
    if (el && val) el.placeholder = val
  })

  // RTL pour arabe
  document.documentElement.dir  = currentLang === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = currentLang

  // Labels langue
  document.querySelectorAll('#lang-label, #lang-label-app').forEach(el => {
    el.textContent = currentLang.toUpperCase()
  })

  // Marquer option active
  document.querySelectorAll('.lang-opt').forEach(o => {
    o.classList.toggle('active', o.dataset.lang === currentLang)
  })
}
