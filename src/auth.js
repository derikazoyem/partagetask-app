import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updateProfile, GoogleAuthProvider, signInWithPopup,
  sendPasswordResetEmail, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, fetchSignInMethodsForEmail
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { $, showScreen, toast } from './ui.js'
import { t } from './i18n.js'

const provider = new GoogleAuthProvider()

// ── Formulaires ────────────────────────────────────────────────────────────
export function showLogin() {
  $('form-login').style.display    = ''
  $('form-register').style.display = 'none'
  $('form-forgot').style.display   = 'none'
}
export function showRegister() {
  $('form-login').style.display    = 'none'
  $('form-register').style.display = ''
  $('form-forgot').style.display   = 'none'
}
export function showForgot() {
  $('form-login').style.display    = 'none'
  $('form-register').style.display = 'none'
  $('form-forgot').style.display   = ''
}

// ── Google ─────────────────────────────────────────────────────────────────
export async function loginGoogle() {
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    console.error(e)
    toast(t('err_google') || 'Erreur connexion Google', 'err')
  }
}

// ── Email/Password ─────────────────────────────────────────────────────────
export async function loginEmail() {
  const email = $('login-email').value.trim()
  const pw    = $('login-pw').value
  const err   = $('login-error')
  const btn   = $('btn-login')
  err.style.display = 'none'
  if (!email || !pw) { err.textContent = t('err_fill_all') || 'Remplissez tous les champs.'; err.style.display = 'block'; return }
  btn.disabled = true; btn.textContent = '...'
  try {
    await signInWithEmailAndPassword(auth, email, pw)
    $('login-pw').value = ''
  } catch (e) {
    err.textContent = e.code?.includes('invalid-credential') || e.code?.includes('wrong-password')
      ? (t('err_wrong_pw') || 'Email ou mot de passe incorrect.')
      : (t('err_retry') || 'Erreur de connexion.')
    err.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.textContent = t('btn_login') || 'Se connecter'
  }
}

export async function registerEmail() {
  const name  = $('reg-name').value.trim()
  const email = $('reg-email').value.trim()
  const pw    = $('reg-pw').value
  const err   = $('reg-error')
  const btn   = $('btn-register')
  err.style.display = 'none'
  if (!name)       { err.textContent = t('err_name_required') || 'Entrez votre nom.'; err.style.display = 'block'; return }
  if (!email)      { err.textContent = t('err_email_required') || 'Entrez votre email.'; err.style.display = 'block'; return }
  if (pw.length < 6){ err.textContent = t('err_pw_short') || 'Mot de passe min. 6 caractères.'; err.style.display = 'block'; return }
  btn.disabled = true; btn.textContent = '...'
  try {
    // Vérifier si l'email existe déjà (Google ou autre)
    const methods = await fetchSignInMethodsForEmail(auth, email)
    if (methods.length > 0) {
      const isGoogle = methods.includes('google.com')
      err.textContent = isGoogle
        ? 'Cet email est déjà associé à un compte Google. Connectez-vous avec Google.'
        : (t('err_email_used') || 'Email déjà utilisé.')
      err.style.display = 'block'
      btn.disabled = false; btn.textContent = t('btn_register') || 'Créer mon compte'
      return
    }
    const cred = await createUserWithEmailAndPassword(auth, email, pw)
    await updateProfile(cred.user, { displayName: name })
  } catch (e) {
    err.textContent = e.code === 'auth/email-already-in-use'
      ? (t('err_email_used') || 'Email déjà utilisé.')
      : (t('err_retry') || 'Erreur création compte.')
    err.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.textContent = t('btn_register') || 'Créer mon compte'
  }
}

export async function sendForgotPw() {
  const email = $('forgot-email').value.trim()
  const err   = $('forgot-error')
  const succ  = $('forgot-success')
  const btn   = $('btn-forgot')
  err.style.display = 'none'; succ.style.display = 'none'
  if (!email) { err.textContent = t('err_email_required') || 'Entrez votre email.'; err.style.display = 'block'; return }
  btn.disabled = true; btn.textContent = '...'
  try {
    await sendPasswordResetEmail(auth, email)
    succ.textContent = t('forgot_sent') || 'Email envoyé ! Vérifiez votre boîte mail.'
    succ.style.display = 'block'
    setTimeout(() => showLogin(), 3000)
  } catch (e) {
    err.textContent = e.code === 'auth/user-not-found'
      ? (t('err_no_account') || 'Aucun compte avec cet email.')
      : (t('err_retry') || 'Erreur envoi.')
    err.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.textContent = t('send_link') || 'Envoyer le lien'
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────
export async function doLogout() {
  await signOut(auth)
}

// ── Changer mot de passe ───────────────────────────────────────────────────
export async function changePw(oldPw, newPw, confirmPw) {
  if (newPw.length < 6) return { error: t('err_pw_short') || 'Minimum 6 caractères.' }
  if (newPw !== confirmPw) return { error: t('err_pw_mismatch') || 'Les mots de passe ne correspondent pas.' }
  const user = auth.currentUser
  if (!user) return { error: 'Non connecté.' }
  if (user.providerData[0]?.providerId === 'google.com') {
    return { error: t('google_account') || 'Compte Google — mot de passe géré par Google.' }
  }
  try {
    const cred = EmailAuthProvider.credential(user.email, oldPw)
    await reauthenticateWithCredential(user, cred)
    await updatePassword(user, newPw)
    return { success: true }
  } catch (e) {
    return { error: e.code?.includes('wrong-password') || e.code?.includes('invalid-credential')
      ? (t('pw_wrong') || 'Mot de passe actuel incorrect.')
      : (t('err_retry') || 'Erreur.') }
  }
}

// ── Sauvegarder profil dans Firestore ─────────────────────────────────────
export async function saveUserProfile(user) {
  await setDoc(doc(db, 'users', user.uid), {
    displayName: user.displayName || user.email.split('@')[0],
    email: user.email,
    photoURL: user.photoURL || '',
    updatedAt: Date.now()
  }, { merge: true })
}