// ── DOM cache ──────────────────────────────────────────────────────────────
const _cache = {}
export function $(id) {
  if (!_cache[id]) _cache[id] = document.getElementById(id)
  return _cache[id]
}

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null
export function toast(msg, type = 'ok') {
  const el = $('toast')
  el.textContent = msg
  el.className = `toast show ${type}`
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200)
}

// ── Loading screen ─────────────────────────────────────────────────────────
export function showLoading(msg) {
  const el = $('loading')
  el.style.display = 'flex'
  const msgEl = $('loading-msg')
  if (msgEl && msg) msgEl.textContent = msg
}

export function hideLoading() {
  const el = $('loading')
  el.style.transition = 'opacity .3s ease'
  el.style.opacity = '0'
  setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1' }, 300)
}

// ── Screen navigation ──────────────────────────────────────────────────────
export function showScreen(id) {
  hideLoading()
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  const screen = document.getElementById(id)
  if (screen) screen.classList.add('active')
}

// ── Page navigation (dans app) ─────────────────────────────────────────────
export function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none')
  const page = document.getElementById(`page-${pageId}`)
  if (page) page.style.display = 'block'

  document.querySelectorAll('.page-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId)
    // Couleurs spéciales
    btn.classList.remove('p-rec', 'p-bil', 'p-mem')
    if (btn.dataset.page === pageId) {
      if (pageId === 'recettes') btn.classList.add('p-rec')
      else if (pageId === 'bilan') btn.classList.add('p-bil')
      else if (pageId === 'membres') btn.classList.add('p-mem')
    }
  })
}

// ── Tab navigation ─────────────────────────────────────────────────────────
export function showTab(tabId, group) {
  document.querySelectorAll(`[data-group="${group}"]`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId)
  })
  // Trouver les contenus liés au groupe
  const allTabs = document.querySelectorAll(`[data-group="${group}"]`)
  allTabs.forEach(btn => {
    const content = document.getElementById(btn.dataset.tab)
    if (content) content.style.display = btn.dataset.tab === tabId ? 'block' : 'none'
  })
}

// ── Modal dynamique ────────────────────────────────────────────────────────
const openModals = {}

export function openModal(id) {
  const el = document.getElementById(id)
  if (el) el.classList.add('open')
}

export function closeModal(id) {
  const el = document.getElementById(id)
  if (el) el.classList.remove('open')
}

// Créer un modal dynamiquement si pas encore dans le DOM
export function createModal(id, html) {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('div')
    el.className = 'modal-bg'
    el.id = id
    el.innerHTML = `<div class="modal">${html}</div>`
    document.getElementById('modals-container').appendChild(el)
    // Fermer au clic extérieur
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open') })
  }
  return el
}

// ── Toggle password visibility ─────────────────────────────────────────────
export function initPwToggles() {
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target)
      if (!input) return
      input.type = input.type === 'password' ? 'text' : 'password'
      btn.textContent = input.type === 'password' ? '👁' : '🙈'
    })
  })
}

// ── Avatar HTML ────────────────────────────────────────────────────────────
export function avatarHtml(uid, displayName, photoURL, size = 34) {
  if (photoURL) {
    return `<img src="${photoURL}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover" alt="">`
  }
  const color = colorForUid(uid)
  const ini = initials(displayName)
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:${Math.round(size * .35)}px;flex-shrink:0">${ini}</div>`
}

export function colorForUid(uid) {
  const colors = ['#6c63ff','#3ecf8e','#f6ad55','#f56565','#38bdf8','#fb7185','#a3e635','#f97316']
  let h = 0
  for (const c of (uid || '')) h = (h * 31 + c.charCodeAt(0)) % colors.length
  return colors[Math.abs(h)]
}

export function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
}

// ── Format monnaie ─────────────────────────────────────────────────────────
export function fmt(n, currency = 'FCFA') {
  const v = parseFloat(n || 0).toFixed(2)
  const [i, d] = v.split('.')
  const num = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + d
  const symbols = { EUR: '€', USD: '$', GBP: '£' }
  const sym = symbols[currency]
  return sym ? `${num} ${sym}` : `${num} ${currency}`
}

// ── Author tag ─────────────────────────────────────────────────────────────
export function authorTag(uid, displayName) {
  const color = colorForUid(uid)
  return `<span class="author-tag" style="background:${color}22;color:${color}">${initials(displayName)} ${displayName}</span>`
}
