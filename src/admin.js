import { collection, onSnapshot, query, orderBy, getDocs, setDoc, addDoc, doc } from 'firebase/firestore'
import { db, fnApproveMember, fnRejectMember, fnRegenerateInviteCode } from './firebase.js'
import { $, toast, createModal, openModal, closeModal, avatarHtml, colorForUid, initials, fmt } from './ui.js'
import { t } from './i18n.js'

let unsubPending = null
let currentProject = null
let ME = null
let pendingMembers = {}
let budgetMovements = {}

export function initAdmin(project, me) {
  currentProject = project
  ME = me
}

export function destroyAdmin() {
  if (unsubPending) { unsubPending(); unsubPending = null }
}

// ── Demandes en attente ────────────────────────────────────────────────────
export function startPendingListener(onUpdate) {
  if (unsubPending) { unsubPending(); unsubPending = null }
  if (currentProject.adminUid !== ME.uid) return

  unsubPending = onSnapshot(
    collection(db, 'projects', currentProject.id, 'pendingMembers'),
    snap => {
      pendingMembers = {}
      snap.docs.forEach(d => { pendingMembers[d.id] = { id: d.id, ...d.data() } })
      if (onUpdate) onUpdate(pendingMembers)
    },
    err => console.error(err)
  )
}

export function renderPendingSection(pendingMembers) {
  const isAdmin = currentProject.adminUid === ME.uid
  const section = $('pending-section')
  const count   = Object.keys(pendingMembers).length
  if (!isAdmin || count === 0) { section.style.display = 'none'; return }
  section.style.display = 'block'
  $('pending-count').textContent = count
  const grid = $('pending-grid')
  grid.innerHTML = Object.entries(pendingMembers).map(([uid, p]) => `
    <div class="member-card pending-card" data-uid="${uid}" style="cursor:pointer;border-color:var(--warn)">
      ${avatarHtml(uid, p.displayName, p.photoURL, 40)}
      <div class="member-info">
        <div class="member-name">${p.displayName}</div>
        <div class="member-role" style="color:var(--warn)">⏳ En attente · Cliquer pour décider</div>
      </div>
    </div>`).join('')

  grid.querySelectorAll('.pending-card').forEach(card => {
    card.addEventListener('click', () => openApproveModal(card.dataset.uid))
  })
  updateMembersBadge(count)
}

function updateMembersBadge(count) {
  const btn = document.querySelector('[data-page="membres"]')
  if (!btn) return
  btn.textContent = count > 0 && currentProject.adminUid === ME.uid
    ? `👥 Membres 🔴${count}`
    : '👥 Membres'
}

function openApproveModal(uid) {
  const p = pendingMembers[uid]
  if (!p) return
  const id = 'approve-modal'
  createModal(id, `
    <h3>👤 ${t('approve_request') || 'Demande d\'accès'}</h3>
    <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1.2rem;padding:1rem;background:var(--surface);border-radius:10px">
      ${avatarHtml(uid, p.displayName, p.photoURL, 40)}
      <div>
        <div style="font-weight:700">${p.displayName}</div>
        <div style="font-size:.8rem;color:var(--muted)">${p.email || ''}</div>
        <div style="font-size:.75rem;color:var(--muted)">Demande le ${new Date(p.requestedAt).toLocaleString('fr-FR')}</div>
      </div>
    </div>
    <p style="color:var(--muted);font-size:.84rem;margin-bottom:1.2rem">
      ${t('approve_question') || 'Voulez-vous accepter cette personne dans le projet ?'}
    </p>
    <div class="modal-actions">
      <button class="btn danger" id="btn-reject-member">✗ ${t('btn_reject') || 'Refuser'}</button>
      <button class="btn success" id="btn-approve-member">✓ ${t('btn_approve') || 'Approuver'}</button>
    </div>
    <button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')" style="margin-top:.7rem;width:100%">${t('btn_cancel') || 'Annuler'}</button>
  `)
  openModal(id)

  document.getElementById('btn-approve-member').onclick = async () => {
    try {
      const result = await fnApproveMember({ projectId: currentProject.id, memberUid: uid })
      closeModal(id)
      toast(`${result.data.memberName} ${t('approved') || 'approuvé(e) !'}`, 'ok')
    } catch (e) { toast(e.message || t('err_retry'), 'err') }
  }
  document.getElementById('btn-reject-member').onclick = async () => {
    try {
      const result = await fnRejectMember({ projectId: currentProject.id, memberUid: uid })
      closeModal(id)
      toast(`${result.data.memberName} ${t('rejected') || 'refusé(e).'}`, 'ok')
    } catch (e) { toast(e.message || t('err_retry'), 'err') }
  }
}

// ── Budget mouvements ──────────────────────────────────────────────────────
export async function loadBudgetMovements() {
  budgetMovements = {}
  const snap = await getDocs(collection(db, 'projects', currentProject.id, 'budgetMovements'))
  for (const userDoc of snap.docs) {
    const mvSnap = await getDocs(query(
      collection(db, 'projects', currentProject.id, 'budgetMovements', userDoc.id, 'movements'),
      orderBy('timestamp', 'asc')
    ))
    budgetMovements[userDoc.id] = mvSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  }
  return budgetMovements
}

export function getBudgetTotal(uid) {
  return (budgetMovements[uid] || []).reduce((s, m) => s + m.amount, 0)
}

export function getBudgetMovements() {
  return budgetMovements
}

export function openBudgetMvModal(uid, displayName) {
  if (currentProject.adminUid !== ME.uid) { toast(t('admin_only') || 'Réservé à l\'admin.', 'err'); return }
  let mvType = 1
  const current = getBudgetTotal(uid)
  const id = 'budget-mv-modal'
  createModal(id, `
    <h3>💼 ${t('budget_mv') || 'Budget'} — ${displayName}</h3>
    <p style="color:var(--muted);font-size:.82rem;margin-bottom:.9rem">
      ${t('current_budget') || 'Budget actuel :'} <strong>${fmt(current, currentProject.currency)}</strong>
    </p>
    <div class="mv-type-btns">
      <button class="mv-btn pos active-mv" id="mv-pos-btn">+ ${t('btn_add_budget') || 'Ajouter'}</button>
      <button class="mv-btn" id="mv-neg-btn">− ${t('btn_sub_budget') || 'Soustraire'}</button>
    </div>
    <div class="form-group"><label>${t('lbl_amount') || 'Montant'}</label><input type="number" id="bm-amount" min="0" step="any" placeholder="0"></div>
    <div class="form-group"><label>${t('lbl_note') || 'Note'}</label><input type="text" id="bm-note" placeholder="${t('placeholder_note') || 'Ex: Versement mars...'}"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
      <button class="btn warn" id="bm-submit">${t('btn_save') || 'Enregistrer'}</button>
    </div>
  `)
  openModal(id)

  // Toggle +/-
  document.getElementById('mv-pos-btn').onclick = () => {
    mvType = 1
    document.getElementById('mv-pos-btn').className = 'mv-btn pos active-mv'
    document.getElementById('mv-neg-btn').className = 'mv-btn'
  }
  document.getElementById('mv-neg-btn').onclick = () => {
    mvType = -1
    document.getElementById('mv-neg-btn').className = 'mv-btn neg active-mv'
    document.getElementById('mv-pos-btn').className = 'mv-btn'
  }

  document.getElementById('bm-submit').onclick = async () => {
    const amount = parseFloat(document.getElementById('bm-amount').value)
    const note   = document.getElementById('bm-note').value.trim() || '(sans note)'
    if (isNaN(amount) || amount <= 0) { toast(t('err_invalid_amount') || 'Montant invalide.', 'err'); return }
    const currentTotal = getBudgetTotal(uid)
    try {
      await setDoc(doc(db, 'projects', currentProject.id, 'budgetMovements', uid), { uid }, { merge: true })
      await addDoc(collection(db, 'projects', currentProject.id, 'budgetMovements', uid, 'movements'), {
        amount: mvType * amount,
        note,
        modifiedBy: ME.displayName,
        date: new Date().toLocaleDateString('fr-FR'),
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        soldeApres: currentTotal + (mvType * amount)
      })
      // Refresh local
      const mvSnap = await getDocs(query(
        collection(db, 'projects', currentProject.id, 'budgetMovements', uid, 'movements'),
        orderBy('timestamp', 'asc')
      ))
      budgetMovements[uid] = mvSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      closeModal(id)
      toast(t('budget_updated') || 'Budget mis à jour.', 'ok')
    } catch (e) { console.error(e); toast(t('err_retry'), 'err') }
  }
}

export function openHistModal(uid, displayName) {
  const mvs = (budgetMovements[uid] || []).slice().reverse()
  const total = getBudgetTotal(uid)
  const id = 'hist-modal'
  const histHtml = mvs.length
    ? mvs.map(m => `<div class="hist-row">
        <span style="color:var(--muted);font-size:.75rem;white-space:nowrap">${m.date} ${m.time}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.note} <span style="color:var(--muted);font-size:.72rem">par ${m.modifiedBy}</span></span>
        <span class="${m.amount >= 0 ? 'mv-pos' : 'mv-neg'}">${m.amount >= 0 ? '+' : ''}${fmt(m.amount, currentProject.currency)}</span>
        <span style="color:var(--muted);font-size:.75rem">→ ${fmt(m.soldeApres, currentProject.currency)}</span>
      </div>`).join('')
    : `<div style="text-align:center;padding:1.2rem;color:var(--muted)">${t('no_movements') || 'Aucun mouvement'}</div>`

  createModal(id, `
    <h3>📋 ${t('hist_budget') || 'Historique budget'} — ${displayName}</h3>
    <p style="color:var(--muted);font-size:.82rem;margin-bottom:.9rem">
      ${t('hist_total') || 'Total :'} <strong>${fmt(total, currentProject.currency)}</strong>
    </p>
    <div style="background:var(--surface);border-radius:8px;border:1px solid var(--border);max-height:380px;overflow-y:auto">
      ${histHtml}
    </div>
    <div class="modal-actions"><button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">${t('btn_cancel') || 'Fermer'}</button></div>
  `)
  openModal(id)
}

// ── Régénérer code invitation ──────────────────────────────────────────────
export async function regenerateCode(onSuccess) {
  try {
    const result = await fnRegenerateInviteCode({ projectId: currentProject.id })
    if (onSuccess) onSuccess(result.data.inviteCode)
    toast(t('code_regenerated') || 'Nouveau code généré ! Valable 7 jours.', 'ok')
  } catch (e) { console.error(e); toast(t('err_retry'), 'err') }
}
