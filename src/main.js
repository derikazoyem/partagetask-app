import { onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { $, showScreen, showPage, showTab, toast, initPwToggles } from './ui.js'
import { loadLang, applyTranslations, detectLang, getLang, t } from './i18n.js'
import { loginGoogle, loginEmail, registerEmail, sendForgotPw, doLogout, changePw, saveUserProfile, showLogin, showRegister, showForgot } from './auth.js'
import { initDashboard, destroyDashboard, openCreateModal, openJoinModal, handleUrlJoin } from './dashboard.js'
import { openProject, destroyProject, addDepense, addRecette, openInviteModal, doExportPDF, doExportExcel, initDepPreview, initRecPreview, initRegenCode, startHistoryListener, renderBilan } from './project.js'
import { startInactivityWatcher, stopInactivityWatcher, initInactivityModal } from './inactivity.js'
import './styles.css'


let ME = null
let currentProjectId = null

// ── Loading messages ────────────────────────────────────────────────────────
const loadMsgs = ['Initialisation...', 'Connexion sécurisée...', 'Chargement...']
let msgIdx = 0
const msgEl = $('loading-msg')
const msgInterval = setInterval(() => {
  msgIdx = (msgIdx + 1) % loadMsgs.length
  if (msgEl) msgEl.textContent = loadMsgs[msgIdx]
}, 900)

// ── Init langue ─────────────────────────────────────────────────────────────
;(async () => {
  const lang = detectLang()
  await loadLang(lang)
  applyTranslations()
})()

// ── Auth state ──────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  clearInterval(msgInterval)

  if (user) {
    ME = {
      uid: user.uid,
      displayName: user.displayName || user.email.split('@')[0],
      email: user.email,
      photoURL: user.photoURL || ''
    }
    // Sauvegarder profil
    await saveUserProfile(user)

    // Vérifier join via URL
    const urlCode = new URLSearchParams(window.location.search).get('join')
    if (urlCode) {
      await handleUrlJoin(urlCode, pid => openProjectScreen(pid))
    }

    // Dashboard
    showScreen('dashboard-screen')
    initDashboard(ME, pid => openProjectScreen(pid))
    startInactivityWatcher(() => doLogout())
    initInactivityModal(() => doLogout())

    // Tutoriel première connexion
    checkFirstLogin()

  } else {
    ME = null
    currentProjectId = null
    stopInactivityWatcher()
    destroyDashboard()
    destroyProject()
    showScreen('auth-screen')
  }
})

// ── Ouvrir projet ───────────────────────────────────────────────────────────
async function openProjectScreen(projectId) {
  currentProjectId = projectId
  destroyDashboard()
  await openProject(projectId, ME)
  initDepPreview()
  initRecPreview()
  initRegenCode()
}

// ── Back to dashboard ────────────────────────────────────────────────────────
function backToDashboard() {
  destroyProject()
  currentProjectId = null
  showScreen('dashboard-screen')
  initDashboard(ME, pid => openProjectScreen(pid))
}

// ── Tutoriel ─────────────────────────────────────────────────────────────────
const TUTO_STEPS_KEY = 'tuto'
let tutoStep = 0

async function checkFirstLogin() {
  try {
    const snap = await import('firebase/firestore').then(({ getDoc }) =>
      getDoc(doc(db, 'users', ME.uid))
    )
    if (!snap.exists() || !snap.data().tutoSeen) startTuto()
  } catch (e) { console.error(e) }
}

function startTuto() {
  tutoStep = 0
  renderTuto()
  $('tuto-overlay').classList.add('open')
}

function renderTuto() {
  const steps = t(TUTO_STEPS_KEY) || []
  if (!steps.length) { closeTuto(); return }
  const s = steps[tutoStep]
  if (!s) { closeTuto(); return }
  $('tuto-icon').textContent  = s.icon
  $('tuto-title').textContent = s.title
  $('tuto-desc').textContent  = s.desc
  $('tuto-prev').style.visibility = tutoStep > 0 ? 'visible' : 'hidden'
  $('tuto-next').textContent = tutoStep === steps.length - 1 ? (t('btn_finish') || 'Terminer') : (t('btn_next') || 'Suivant →')
  $('tuto-dots').innerHTML = steps.map((_, i) =>
    `<div class="tuto-dot${i === tutoStep ? ' active' : ''}"></div>`
  ).join('')
}

async function closeTuto() {
  $('tuto-overlay').classList.remove('open')
  try {
    await setDoc(doc(db, 'users', ME.uid), { tutoSeen: true }, { merge: true })
  } catch (e) { console.error(e) }
}

// ── Langue ───────────────────────────────────────────────────────────────────
async function setLang(lang) {
  localStorage.setItem('pt_lang', lang)
  await loadLang(lang)
  applyTranslations()
  closeLangDropdowns()
}

function closeLangDropdowns() {
  document.querySelectorAll('.lang-dropdown').forEach(d => d.classList.remove('open'))
}

// ── Mot de passe ─────────────────────────────────────────────────────────────
function openPwModal() {
  import('./ui.js').then(({ createModal, openModal, closeModal }) => {
    const id = 'pw-modal'
    createModal(id, `
      <h3>🔑 ${t('change_pw') || 'Changer le mot de passe'}</h3>
      <div class="form-group pw-field"><label>${t('lbl_pw_old') || 'Actuel'}</label><input type="password" id="pw-old"><button class="pw-toggle" data-target="pw-old">👁</button></div>
      <div class="form-group pw-field"><label>${t('lbl_pw_new') || 'Nouveau'}</label><input type="password" id="pw-new"><button class="pw-toggle" data-target="pw-new">👁</button></div>
      <div class="form-group pw-field"><label>${t('lbl_pw_confirm') || 'Confirmer'}</label><input type="password" id="pw-cf"><button class="pw-toggle" data-target="pw-cf">👁</button></div>
      <div class="error-msg" id="pw-err"></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
        <button class="btn" id="pw-submit">${t('btn_save') || 'Changer'}</button>
      </div>
    `)
    openModal(id)
    initPwToggles()
    document.getElementById('pw-submit').onclick = async () => {
      const err = document.getElementById('pw-err')
      const result = await changePw(
        document.getElementById('pw-old').value,
        document.getElementById('pw-new').value,
        document.getElementById('pw-cf').value
      )
      if (result.error) { err.textContent = result.error; err.style.display = 'block' }
      else { closeModal(id); toast(t('pw_changed') || 'Mot de passe changé !', 'ok') }
    }
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════════════════════════════════════════

// Auth
$('btn-google')?.addEventListener('click', loginGoogle)
$('btn-login')?.addEventListener('click', loginEmail)
$('btn-register')?.addEventListener('click', registerEmail)
$('btn-forgot')?.addEventListener('click', sendForgotPw)
$('link-to-register')?.addEventListener('click', showRegister)
$('link-to-login')?.addEventListener('click', showLogin)
$('link-forgot')?.addEventListener('click', showForgot)
$('link-back-login')?.addEventListener('click', showLogin)
$('login-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginEmail() })
$('login-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginEmail() })
$('reg-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') registerEmail() })

// Dashboard
$('btn-new-project')?.addEventListener('click', openCreateModal)
$('btn-join-project')?.addEventListener('click', () => openJoinModal(pid => openProjectScreen(pid)))
$('btn-logout-dash')?.addEventListener('click', doLogout)
$('btn-pw-dash')?.addEventListener('click', openPwModal)
$('btn-help-dash')?.addEventListener('click', startTuto)

// App header
$('btn-back')?.addEventListener('click', backToDashboard)
$('btn-invite')?.addEventListener('click', openInviteModal)
$('btn-export-pdf')?.addEventListener('click', doExportPDF)
$('btn-export-excel')?.addEventListener('click', doExportExcel)

// Page navigation
document.getElementById('page-nav')?.addEventListener('click', e => {
  const btn = e.target.closest('.page-btn')
  if (!btn) return

  const page = btn.dataset.page

  showPage(page)

  if (page === 'bilan') {
    renderBilan()
  }
})

// Tab navigation
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    showTab(tab.dataset.tab, tab.dataset.group)
    // Démarrer le listener historique quand on ouvre l'onglet
    if (tab.dataset.tab === 'dep-history') startHistoryListener('tasks')
    if (tab.dataset.tab === 'rec-history') startHistoryListener('recettes')
  })
})

// Ajouter dépense / recette
$('btn-add-dep')?.addEventListener('click', addDepense)
$('btn-add-rec')?.addEventListener('click', addRecette)
$('dep-desc')?.addEventListener('keydown', e => { if (e.key === 'Enter') addDepense() })
$('rec-desc')?.addEventListener('keydown', e => { if (e.key === 'Enter') addRecette() })

// Langue — dashboard
$('lang-btn')?.addEventListener('click', e => {
  e.stopPropagation()
  $('lang-dropdown')?.classList.toggle('open')
  $('lang-dropdown-app')?.classList.remove('open')
})
$('lang-btn-app')?.addEventListener('click', e => {
  e.stopPropagation()
  $('lang-dropdown-app')?.classList.toggle('open')
  $('lang-dropdown')?.classList.remove('open')
})
document.querySelectorAll('.lang-opt').forEach(opt => {
  opt.addEventListener('click', () => setLang(opt.dataset.lang))
})
document.addEventListener('click', () => closeLangDropdowns())

// Tutoriel
$('tuto-prev')?.addEventListener('click', () => {
  tutoStep = Math.max(0, tutoStep - 1)
  renderTuto()
})
$('tuto-next')?.addEventListener('click', () => {
  const steps = t(TUTO_STEPS_KEY) || []
  tutoStep++
  if (tutoStep >= steps.length) closeTuto()
  else renderTuto()
})
$('tuto-skip')?.addEventListener('click', closeTuto)

// Modal backdrop fermeture
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-bg')) {
    e.target.classList.remove('open')
  }
})

// Pw toggles statiques
initPwToggles()