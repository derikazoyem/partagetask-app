import { $ } from './ui.js'

const DELAY = 30 * 60 * 1000 // 30 minutes
const COUNTDOWN = 60

let inactivityTimer = null
let countdownTimer  = null
let countdownValue  = COUNTDOWN
let onLogoutCb      = null

// Debounce — évite les appels répétés sur mousemove
let debounceTimer = null
function handleActivity() {
  if (debounceTimer) return
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    resetInactivity()
  }, 300)
}

const EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']

export function startInactivityWatcher(onLogout) {
  onLogoutCb = onLogout
  EVENTS.forEach(ev => document.addEventListener(ev, handleActivity, { passive: true }))
  resetInactivity()
}

export function stopInactivityWatcher() {
  EVENTS.forEach(ev => document.removeEventListener(ev, handleActivity))
  clearTimeout(inactivityTimer)
  clearInterval(countdownTimer)
  clearTimeout(debounceTimer)
  hideWarning()
}

export function resetInactivity() {
  hideWarning()
  clearTimeout(inactivityTimer)
  clearInterval(countdownTimer)
  countdownValue = COUNTDOWN
  inactivityTimer = setTimeout(showWarning, DELAY)
}

function showWarning() {
  const modal = $('inactivity-modal')
  if (!modal) return
  modal.classList.add('open')
  $('inactivity-countdown').textContent = countdownValue

  countdownTimer = setInterval(() => {
    countdownValue--
    const el = $('inactivity-countdown')
    if (el) el.textContent = countdownValue
    if (countdownValue <= 0) {
      clearInterval(countdownTimer)
      hideWarning()
      if (onLogoutCb) onLogoutCb()
    }
  }, 1000)
}

function hideWarning() {
  const modal = $('inactivity-modal')
  if (modal) modal.classList.remove('open')
}

export function initInactivityModal(onLogout) {
  onLogoutCb = onLogout
  const stayBtn    = $('btn-inactivity-stay')
  const logoutBtn  = $('btn-inactivity-logout')
  if (stayBtn)   stayBtn.onclick   = resetInactivity
  if (logoutBtn) logoutBtn.onclick = () => { if (onLogoutCb) onLogoutCb() }
}
