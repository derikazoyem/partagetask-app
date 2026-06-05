import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  setDoc
} from 'firebase/firestore'
import { db } from './firebase.js'
import { $, toast, showScreen, showPage, showTab, fmt, authorTag, avatarHtml, colorForUid, initials, createModal, openModal, closeModal } from './ui.js'
import { t } from './i18n.js'
import { uploadFiles, deleteFile, renderFilesList } from './files.js'
import { initAdmin, destroyAdmin, startPendingListener, renderPendingSection, loadBudgetMovements, getBudgetTotal, getBudgetMovements, openBudgetMvModal, openHistModal, regenerateCode } from './admin.js'
import { exportPDF, exportExcel } from './export.js'

let currentProject = null
let ME = null
let members = {}
let depenses = []
let recettes = []
let unsubDep = null
let unsubRec = null
let unsubMembers = null
let filesDepId = null

// ── Historique ─────────────────────────────────────────────────────────────
let historyCache = { tasks: null, recettes: null }
let unsubHistory = { tasks: null, recettes: null }

export async function openProject(projectId, me) {
  ME = me
  const snap = await getDoc(doc(db, 'projects', projectId))
  if (!snap.exists()) { toast(t('err_retry'), 'err'); return }
  currentProject = { id: snap.id, ...snap.data() }

  $('app-project-name').textContent     = currentProject.name
  $('app-project-currency').textContent = currentProject.currency

  showScreen('app-screen')
  showPage('depenses')

  initAdmin(currentProject, ME)
  startProjectListeners()
  await loadBudgetMovements()

  startPendingListener(pending => {
    renderPendingSection(pending)
  })

  renderInvite()
  const regenWrap = $('regen-wrap')
  if (regenWrap) regenWrap.style.display = currentProject.adminUid === ME.uid ? 'block' : 'none'

  initHistoryControls()
}

export function destroyProject() {
  if (unsubDep)     { unsubDep();     unsubDep = null }
  if (unsubRec)     { unsubRec();     unsubRec = null }
  if (unsubMembers) { unsubMembers(); unsubMembers = null }
  stopHistoryListeners()
  destroyAdmin()
  currentProject = null
  members = {}
  depenses = []
  recettes = []
  historyCache = { tasks: null, recettes: null }
}

// ── Listeners ──────────────────────────────────────────────────────────────
function startProjectListeners() {
  const pid = currentProject.id

  if (unsubDep) unsubDep()
  unsubDep = onSnapshot(
    query(collection(db, 'projects', pid, 'tasks'), orderBy('timestamp', 'desc')),
    snap => { depenses = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderDep() },
    err => console.error(err)
  )

  if (unsubRec) unsubRec()
  unsubRec = onSnapshot(
    query(collection(db, 'projects', pid, 'recettes'), orderBy('timestamp', 'desc')),
    snap => { recettes = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderRec() },
    err => console.error(err)
  )

  if (unsubMembers) unsubMembers()
  unsubMembers = onSnapshot(doc(db, 'projects', pid), snap => {
    if (snap.exists()) {
      members = snap.data().members || {}
      // Synchroniser bilanActivated en temps réel
      currentProject.bilanActivated = snap.data().bilanActivated || false
      renderMembersPage()
      renderBilanIfVisible()
    }
  }, err => console.error(err))
}

function renderBilanIfVisible() {
  const p = document.getElementById('page-bilan')
  if (p && p.style.display !== 'none') renderBilan()
}

// ── DÉPENSES ───────────────────────────────────────────────────────────────
function renderDepSummary() {
  const total = depenses.reduce((s, t) => s + t.qty * t.price, 0)
  const n     = Object.keys(members).length || 1
  $('dep-summary').innerHTML = `
    <div class="stat-card"><div class="label">${t('total_dep') || 'Total dépenses'}</div><div class="value accent">${fmt(total, currentProject.currency)}</div></div>
    <div class="stat-card"><div class="label">${t('nb_dep') || 'Nb dépenses'}</div><div class="value">${depenses.length}</div></div>
    <div class="stat-card"><div class="label">${t('part_member') || 'Part / membre'}</div><div class="value">${fmt(total / n, currentProject.currency)}</div></div>`
}

function renderDepTable() {
  const isAdmin = currentProject.adminUid === ME.uid
  $('dep-actions-col').style.display = isAdmin ? '' : 'none'
  const tbody = $('dep-body')
  const tfoot = $('dep-foot')
  if (!depenses.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="no-data">${t('no_dep') || 'Aucune dépense.'}</td></tr>`
    tfoot.innerHTML = ''; return
  }
  tbody.innerHTML = depenses.map(dep => {
    const tot     = dep.qty * dep.price
    const fc      = (dep.files || []).length
    const fcBadge = fc > 0 ? `<span class="attach-count">${fc}</span>` : ''
    const m       = members[dep.authorUid] || { displayName: dep.authorName || '?' }
    return `<tr>
      <td>${dep.desc}</td><td>${dep.qty}</td>
      <td class="price">${fmt(dep.price, currentProject.currency)}</td>
      <td class="price">${fmt(tot, currentProject.currency)}</td>
      <td>${authorTag(dep.authorUid, m.displayName)}</td>
      <td style="color:var(--muted);font-size:.78rem;white-space:nowrap">${dep.date} ${dep.time}</td>
      <td><button class="icon-action" data-files="${dep.id}" style="color:var(--success)">📎${fcBadge}</button></td>
      <td style="${isAdmin ? '' : 'display:none'}">
        <div class="actions">
          <button class="icon-action edit" data-edit-dep="${dep.id}">✏️</button>
          <button class="icon-action del"  data-del-dep="${dep.id}">🗑</button>
        </div>
      </td>
    </tr>`
  }).join('')

  tbody.querySelectorAll('[data-files]').forEach(btn =>
    btn.addEventListener('click', () => openFilesModal(btn.dataset.files)))
  tbody.querySelectorAll('[data-edit-dep]').forEach(btn =>
    btn.addEventListener('click', () => openEditDep(btn.dataset.editDep)))
  tbody.querySelectorAll('[data-del-dep]').forEach(btn =>
    btn.addEventListener('click', () => openDelDep(btn.dataset.delDep)))

  const total = depenses.reduce((s, t) => s + t.qty * t.price, 0)
  tfoot.innerHTML = `<tr class="total-row">
    <td colspan="3" style="text-align:right;padding-right:.8rem">TOTAL</td>
    <td class="price" style="color:var(--accent2)">${fmt(total, currentProject.currency)}</td>
    <td colspan="${isAdmin ? 4 : 3}"></td>
  </tr>`
}

function renderDep() { renderDepSummary(); renderDepTable() }

export async function addDepense() {
  const desc  = $('dep-desc').value.trim()
  const qty   = parseFloat($('dep-qty').value)
  const price = parseFloat($('dep-price').value)
  if (!desc)                    { toast(t('err_fill_all') || 'Description requise.', 'err'); return }
  if (isNaN(qty) || qty <= 0)   { toast(t('err_qty') || 'Quantité invalide.', 'err'); return }
  if (isNaN(price) || price < 0){ toast(t('err_price') || 'Prix invalide.', 'err'); return }
  const now = new Date()
  try {
    const newRef = await addDoc(collection(db, 'projects', currentProject.id, 'tasks'), {
      desc, qty, price, files: [],
      authorUid: ME.uid, authorName: ME.displayName,
      date: now.toLocaleDateString('fr-FR'),
      time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.getTime()
    })
    await addHistoryEntry('tasks', newRef.id, 'create', { after: { desc, qty, price } })
    $('dep-desc').value = ''; $('dep-qty').value = ''; $('dep-price').value = ''
    $('dep-preview').textContent = ''
    toast(t('dep_added') || 'Dépense ajoutée !', 'ok')
  } catch (e) { console.error(e); toast(t('err_retry'), 'err') }
}

function openEditDep(id) {
  const dep = depenses.find(x => x.id === id); if (!dep) return
  createModal('edit-dep-modal', `
    <h3>✏️ ${t('edit_dep') || 'Modifier la dépense'}</h3>
    <div class="form-group"><label>${t('lbl_desc') || 'Description'}</label><input type="text" id="ed-desc" value="${dep.desc}"></div>
    <div class="form-group"><label>${t('lbl_qty') || 'Quantité'}</label><input type="number" id="ed-qty" value="${dep.qty}" min="0" step="any"></div>
    <div class="form-group"><label>${t('lbl_price') || 'Prix unitaire'}</label><input type="number" id="ed-price" value="${dep.price}" min="0" step="any"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="document.getElementById('edit-dep-modal').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
      <button class="btn" id="ed-submit">${t('btn_save') || 'Enregistrer'}</button>
    </div>
  `)
  openModal('edit-dep-modal')
  document.getElementById('ed-submit').onclick = async () => {
    const desc  = document.getElementById('ed-desc').value.trim()
    const qty   = parseFloat(document.getElementById('ed-qty').value)
    const price = parseFloat(document.getElementById('ed-price').value)
    if (!desc || isNaN(qty) || isNaN(price)) { toast(t('err_fill_all'), 'err'); return }
    try {
      await addHistoryEntry('tasks', id, 'edit', {
        before: { desc: dep.desc, qty: dep.qty, price: dep.price },
        after:  { desc, qty, price }
      })
      await updateDoc(doc(db, 'projects', currentProject.id, 'tasks', id), { desc, qty, price })
      closeModal('edit-dep-modal')
      toast(t('modified') || 'Modifié.', 'ok')
    } catch (e) { console.error(e); toast(t('err_retry'), 'err') }
  }
}

function openDelDep(id) {
  const dep = depenses.find(x => x.id === id); if (!dep) return
  createModal('del-dep-modal', `
    <h3>🗑️ ${t('del_dep') || 'Supprimer ?'}</h3>
    <p style="font-weight:600;margin-bottom:.5rem">${dep.desc}</p>
    <div class="modal-actions">
      <button class="btn secondary" onclick="document.getElementById('del-dep-modal').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
      <button class="btn danger" id="del-dep-confirm">${t('btn_delete') || 'Supprimer'}</button>
    </div>
  `)
  openModal('del-dep-modal')
  document.getElementById('del-dep-confirm').onclick = async () => {
    try {
      await addHistoryEntry('tasks', id, 'delete', {
        before: { desc: dep.desc, qty: dep.qty, price: dep.price }
      })
      await deleteDoc(doc(db, 'projects', currentProject.id, 'tasks', id))
      closeModal('del-dep-modal')
      toast(t('deleted') || 'Supprimé.', 'ok')
    } catch (e) { console.error(e); toast(t('err_retry'), 'err') }
  }
}

// ── FICHIERS ───────────────────────────────────────────────────────────────
function openFilesModal(depId) {
  filesDepId = depId
  const dep     = depenses.find(x => x.id === depId)
  const isAdmin = currentProject.adminUid === ME.uid
  const id      = 'files-modal'
  createModal(id, `
    <h3>📎 Fichiers — ${dep?.desc || ''}</h3>
    <div id="files-list-content">${renderFilesList(dep?.files || [], { depId, projectId: currentProject.id, isAdmin })}</div>
    <div class="file-upload-zone" id="upload-zone">
      <input type="file" id="file-inp" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/heic,.pdf" multiple style="display:none">
      <div style="font-size:1.8rem;margin-bottom:.4rem">📎</div>
      <div style="color:var(--muted);font-size:.82rem">Cliquer pour ajouter</div>
      <div style="font-size:.72rem;color:var(--muted);margin-top:.3rem">Images & PDF · Max 10 Mo · Max 10 fichiers</div>
    </div>
    <div class="upload-bar-wrap" id="up-bar-wrap"><div class="upload-bar" id="up-bar"></div></div>
    <div id="up-status" style="font-size:.78rem;color:var(--muted);margin-top:.4rem;text-align:center"></div>
    <div class="modal-actions"><button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">Fermer</button></div>
  `)
  openModal(id)
  document.getElementById('upload-zone').onclick = () => document.getElementById('file-inp').click()
  document.getElementById('file-inp').onchange = async (e) => {
    const dep  = depenses.find(x => x.id === filesDepId)
    const bar  = document.getElementById('up-bar')
    const wrap = document.getElementById('up-bar-wrap')
    const stat = document.getElementById('up-status')
    wrap.style.display = 'block'; bar.style.width = '0%'
    await uploadFiles({
      files: e.target.files,
      projectId: currentProject.id,
      depId: filesDepId,
      existing: dep?.files || [],
      onProgress: (done, total, name, pct) => {
        stat.textContent = `Upload ${done + 1}/${total} : ${name}`
        if (pct !== undefined) bar.style.width = Math.round(pct * 100) + '%'
      },
      onComplete: (files) => {
        wrap.style.display = 'none'
        document.getElementById('files-list-content').innerHTML =
          renderFilesList(files, { depId: filesDepId, projectId: currentProject.id, isAdmin })
        bindFileDeleteEvents()
      }
    })
    e.target.value = ''
  }
  bindFileDeleteEvents()
}

function bindFileDeleteEvents() {
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      const dep     = depenses.find(x => x.id === filesDepId)
      const updated = await deleteFile({
        projectId: currentProject.id,
        depId: filesDepId,
        files: dep?.files || [],
        index: parseInt(btn.dataset.del)
      })
      if (updated) {
        const isAdmin = currentProject.adminUid === ME.uid
        document.getElementById('files-list-content').innerHTML =
          renderFilesList(updated, { depId: filesDepId, projectId: currentProject.id, isAdmin })
        bindFileDeleteEvents()
      }
    }
  })
}

// ── RECETTES ───────────────────────────────────────────────────────────────
function renderRecSummary() {
  const total = recettes.reduce((s, r) => s + r.amount, 0)
  const n     = Object.keys(members).length || 1
  $('rec-summary').innerHTML = `
    <div class="stat-card"><div class="label">${t('total_rec') || 'Total recettes'}</div><div class="value green">${fmt(total, currentProject.currency)}</div></div>
    <div class="stat-card"><div class="label">${t('nb_rec') || 'Nb recettes'}</div><div class="value">${recettes.length}</div></div>
    <div class="stat-card"><div class="label">${t('part_member') || 'Part / membre'}</div><div class="value green">${fmt(total / n, currentProject.currency)}</div></div>`
}

function renderRecTable() {
  const isAdmin = currentProject.adminUid === ME.uid
  $('rec-actions-col').style.display = isAdmin ? '' : 'none'
  const tbody = $('rec-body')
  const tfoot = $('rec-foot')
  const n     = Object.keys(members).length || 1
  if (!recettes.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="no-data">${t('no_rec') || 'Aucune recette.'}</td></tr>`
    tfoot.innerHTML = ''; return
  }
  tbody.innerHTML = recettes.map(r => {
    const m = members[r.authorUid] || { displayName: r.authorName || '?' }
    return `<tr>
      <td>${r.desc}</td>
      <td class="price green">${fmt(r.amount, currentProject.currency)}</td>
      <td class="price green">${fmt(r.amount / n, currentProject.currency)}</td>
      <td>${authorTag(r.authorUid, m.displayName)}</td>
      <td style="color:var(--muted);font-size:.78rem;white-space:nowrap">${r.date} ${r.time}</td>
      <td style="${isAdmin ? '' : 'display:none'}">
        <div class="actions">
          <button class="icon-action edit" data-edit-rec="${r.id}">✏️</button>
          <button class="icon-action del"  data-del-rec="${r.id}">🗑</button>
        </div>
      </td>
    </tr>`
  }).join('')

  tbody.querySelectorAll('[data-edit-rec]').forEach(btn =>
    btn.addEventListener('click', () => openEditRec(btn.dataset.editRec)))
  tbody.querySelectorAll('[data-del-rec]').forEach(btn =>
    btn.addEventListener('click', () => openDelRec(btn.dataset.delRec)))

  const total = recettes.reduce((s, r) => s + r.amount, 0)
  tfoot.innerHTML = `<tr class="total-row">
    <td>TOTAL</td>
    <td class="price green">${fmt(total, currentProject.currency)}</td>
    <td class="price green">${fmt(total / n, currentProject.currency)}</td>
    <td colspan="${isAdmin ? 3 : 2}"></td>
  </tr>`
}

function renderRec() { renderRecSummary(); renderRecTable() }

export async function addRecette() {
  const desc   = $('rec-desc').value.trim()
  const amount = parseFloat($('rec-amount').value)
  if (!desc)                      { toast(t('err_fill_all'), 'err'); return }
  if (isNaN(amount) || amount <= 0){ toast(t('err_invalid_amount') || 'Montant invalide.', 'err'); return }
  const now = new Date()
  try {
    const recRef = await addDoc(collection(db, 'projects', currentProject.id, 'recettes'), {
      desc, amount, authorUid: ME.uid, authorName: ME.displayName,
      date: now.toLocaleDateString('fr-FR'),
      time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.getTime()
    })
    await addHistoryEntry('recettes', recRef.id, 'create', { after: { desc, amount } })
    $('rec-desc').value = ''; $('rec-amount').value = ''
    $('rec-preview').textContent = ''
    toast(t('rec_added') || 'Recette ajoutée !', 'ok')
  } catch (e) { console.error(e); toast(t('err_retry'), 'err') }
}

function openEditRec(id) {
  const r = recettes.find(x => x.id === id); if (!r) return
  createModal('edit-rec-modal', `
    <h3>✏️ ${t('edit_rec') || 'Modifier la recette'}</h3>
    <div class="form-group"><label>Description</label><input type="text" id="er-desc" value="${r.desc}"></div>
    <div class="form-group"><label>Montant</label><input type="number" id="er-amount" value="${r.amount}" min="0" step="any"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="document.getElementById('edit-rec-modal').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
      <button class="btn" id="er-submit">${t('btn_save') || 'Enregistrer'}</button>
    </div>
  `)
  openModal('edit-rec-modal')
  document.getElementById('er-submit').onclick = async () => {
    const desc   = document.getElementById('er-desc').value.trim()
    const amount = parseFloat(document.getElementById('er-amount').value)
    if (!desc || isNaN(amount)) { toast(t('err_fill_all'), 'err'); return }
    try {
      await addHistoryEntry('recettes', id, 'edit', {
        before: { desc: r.desc, amount: r.amount },
        after:  { desc, amount }
      })
      await updateDoc(doc(db, 'projects', currentProject.id, 'recettes', id), { desc, amount })
      closeModal('edit-rec-modal')
      toast(t('modified') || 'Modifié.', 'ok')
    } catch (e) { console.error(e); toast(t('err_retry'), 'err') }
  }
}

function openDelRec(id) {
  const r = recettes.find(x => x.id === id); if (!r) return
  createModal('del-rec-modal', `
    <h3>🗑️ Supprimer ?</h3>
    <p style="font-weight:600;margin-bottom:.5rem">${r.desc}</p>
    <div class="modal-actions">
      <button class="btn secondary" onclick="document.getElementById('del-rec-modal').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
      <button class="btn danger" id="del-rec-confirm">${t('btn_delete') || 'Supprimer'}</button>
    </div>
  `)
  openModal('del-rec-modal')
  document.getElementById('del-rec-confirm').onclick = async () => {
    try {
      await addHistoryEntry('recettes', id, 'delete', {
        before: { desc: r.desc, amount: r.amount }
      })
      await deleteDoc(doc(db, 'projects', currentProject.id, 'recettes', id))
      closeModal('del-rec-modal')
      toast(t('deleted') || 'Supprimé.', 'ok')
    } catch (e) { console.error(e); toast(t('err_retry'), 'err') }
  }
}

// ── HISTORIQUE ─────────────────────────────────────────────────────────────
async function addHistoryEntry(collectionName, docId, action, data) {
  try {
    const now = new Date()
    await addDoc(collection(db, 'projects', currentProject.id, 'history'), {
      collection: collectionName,
      docId,
      action,
      before: data.before || null,
      after:  data.after  || null,
      modifiedBy:    ME.displayName,
      modifiedByUid: ME.uid,
      date: now.toLocaleDateString('fr-FR'),
      time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.getTime()
    })
  } catch (e) {
    console.warn('History entry failed:', e)
  }
}

export function startHistoryListener(collectionName) {
  const listId = collectionName === 'tasks' ? 'dep-history-list' : 'rec-history-list'
  const key    = collectionName

  if (unsubHistory[key]) { unsubHistory[key](); unsubHistory[key] = null }

  const el = document.getElementById(listId)
  if (el) el.innerHTML = `<div class="hist-loading"><div class="spinner" style="width:24px;height:24px;margin:.8rem auto"></div></div>`

  unsubHistory[key] = onSnapshot(
    query(collection(db, 'projects', currentProject.id, 'history'), orderBy('timestamp', 'desc')),
    snap => {
      historyCache[key] = snap.docs.map(d => d.data()).filter(e => e.collection === collectionName)
      renderHistoryList(collectionName)
    },
    err => {
      console.error(err)
      const el = document.getElementById(listId)
      if (el) el.innerHTML = `<div class="hist-empty">${t('err_retry') || 'Erreur de chargement'}</div>`
    }
  )
}

function stopHistoryListeners() {
  Object.keys(unsubHistory).forEach(k => {
    if (unsubHistory[k]) { unsubHistory[k](); unsubHistory[k] = null }
  })
}

function renderHistoryList(collectionName) {
  const listId   = collectionName === 'tasks' ? 'dep-history-list' : 'rec-history-list'
  const searchId = collectionName === 'tasks' ? 'dep-hist-search'  : 'rec-hist-search'
  const filterId = collectionName === 'tasks' ? 'dep-hist-filter'  : 'rec-hist-filter'
  const el       = document.getElementById(listId)
  if (!el) return

  const entries = historyCache[collectionName] || []
  const search  = document.getElementById(searchId)?.value?.toLowerCase() || ''
  const filter  = document.getElementById(filterId)?.value || 'all'

  const filtered = entries.filter(e => {
    const matchAction = filter === 'all' || e.action === filter
    const matchSearch = !search ||
      e.modifiedBy?.toLowerCase().includes(search) ||
      e.before?.desc?.toLowerCase().includes(search) ||
      e.after?.desc?.toLowerCase().includes(search) ||
      e.date?.includes(search)
    return matchAction && matchSearch
  })

  const actionIcon  = { create: '✅', edit: '✏️', delete: '🗑' }
  const actionLabel = {
    create: t('hist_action_create') || 'Création',
    edit:   t('hist_action_edit')   || 'Modification',
    delete: t('hist_action_delete') || 'Suppression'
  }
  const actionColor = { create: 'var(--success)', edit: 'var(--accent2)', delete: 'var(--danger)' }

  if (!filtered.length) {
    el.innerHTML = `<div class="hist-empty">${t('no_history') || 'Aucun historique disponible'}</div>`
    return
  }

  el.innerHTML = filtered.map(e => {
    const before = e.before
      ? Object.entries(e.before).filter(([,v]) => v !== null && v !== undefined)
          .map(([k,v]) => `<span class="hist-field"><span class="hist-key">${k}</span> <span class="hist-val-old">${v}</span></span>`).join('')
      : ''
    const after = e.after
      ? Object.entries(e.after).filter(([,v]) => v !== null && v !== undefined)
          .map(([k,v]) => `<span class="hist-field"><span class="hist-key">${k}</span> <span class="hist-val-new">${v}</span></span>`).join('')
      : ''
    return `<div class="hist-entry">
      <div class="hist-entry-header">
        <span class="hist-action-badge" style="background:${actionColor[e.action]}22;color:${actionColor[e.action]}">
          ${actionIcon[e.action]} ${actionLabel[e.action]}
        </span>
        <span class="hist-by">par <strong>${e.modifiedBy}</strong></span>
        <span class="hist-date">${e.date} ${e.time}</span>
      </div>
      ${(before || after) ? `<div class="hist-entry-body">
        ${before ? `<div class="hist-before">${before}</div>` : ''}
        ${before && after ? `<div class="hist-arrow">→</div>` : ''}
        ${after  ? `<div class="hist-after">${after}</div>`  : ''}
      </div>` : ''}
    </div>`
  }).join('')
}

function initHistoryControls() {
  ;[
    { search: 'dep-hist-search', filter: 'dep-hist-filter', col: 'tasks'    },
    { search: 'rec-hist-search', filter: 'rec-hist-filter', col: 'recettes' }
  ].forEach(({ search, filter, col }) => {
    const sEl = document.getElementById(search)
    const fEl = document.getElementById(filter)
    if (sEl) sEl.addEventListener('input',  () => renderHistoryList(col))
    if (fEl) fEl.addEventListener('change', () => renderHistoryList(col))
  })
}

// ── BILAN ──────────────────────────────────────────────────────────────────
function renderBilan() {
  const isAdmin = currentProject.adminUid === ME.uid

  if (!currentProject.bilanActivated) {
    $('bilan-cards').innerHTML = `
      <div style="grid-column:1/-1;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:2rem;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:1rem">⚖️</div>
        <div style="font-size:1rem;font-weight:700;margin-bottom:.5rem">${t('bilan_not_activated') || 'Bilan non activé'}</div>
        <div style="color:var(--muted);font-size:.85rem;margin-bottom:1.2rem">${t('bilan_not_activated_desc') || "L'admin doit activer le bilan et saisir le budget de chaque membre."}</div>
        ${isAdmin ? `<button class="btn sm" id="btn-activate-bilan" style="background:var(--warn);color:#111">⚡ ${t('btn_activate_bilan') || 'Activer le bilan'}</button>` : ''}
      </div>`
    $('bilan-body').innerHTML = ''
    if (isAdmin) document.getElementById('btn-activate-bilan').onclick = openActivateBilanModal
    return
  }

  const n      = Object.keys(members).length || 1
  const totDep = depenses.reduce((s, dep) => s + dep.qty * dep.price, 0)
  const totRec = recettes.reduce((s, r) => s + r.amount, 0)
  const uDep   = totDep / n
  const uRec   = totRec / n
  let cards = '', rows = ''

  Object.entries(members).forEach(([uid, m]) => {
    const budget = getBudgetTotal(uid)
    const solde  = budget + uRec - uDep
    const sc     = solde >= 0 ? 'solde-pos' : 'solde-neg'
    const sign   = solde >= 0 ? '+' : ''
    const adminBtns = isAdmin
      ? `<button class="btn xs" style="background:var(--warn);color:#111" data-budget-uid="${uid}">✏️</button>
         <button class="btn xs secondary" data-hist-uid="${uid}">📋</button>`
      : `<button class="btn xs secondary" data-hist-uid="${uid}">📋</button>`

    cards += `<div class="bilan-card">
      <div class="bc-name">
        ${avatarHtml(uid, m.displayName, m.photoURL, 28)}
        <span style="margin-left:.4rem">${m.displayName}</span>
        <div style="display:flex;gap:.3rem">${adminBtns}</div>
      </div>
      <div class="bc-row"><span>${t('budget_total') || 'Budget total'}</span><span style="color:var(--warn)">${fmt(budget, currentProject.currency)}</span></div>
      <div class="bc-row"><span>${t('rec_per') || 'Recettes (÷N)'}</span><span class="green">${fmt(uRec, currentProject.currency)}</span></div>
      <div class="bc-row"><span>${t('dep_per') || 'Dépenses (÷N)'}</span><span>${fmt(uDep, currentProject.currency)}</span></div>
      <div class="bc-solde"><span>${t('solde') || 'Solde net'}</span><span class="${sc}">${sign}${fmt(solde, currentProject.currency)}</span></div>
    </div>`

    rows += `<tr>
      <td>${avatarHtml(uid, m.displayName, m.photoURL, 24)} <span style="margin-left:.4rem;font-weight:600">${m.displayName}</span></td>
      <td class="price" style="color:var(--warn)">${fmt(budget, currentProject.currency)}</td>
      <td class="price green">${fmt(uRec, currentProject.currency)}</td>
      <td class="price">${fmt(uDep, currentProject.currency)}</td>
      <td class="price ${sc}">${sign}${fmt(solde, currentProject.currency)}</td>
    </tr>`
  })

  $('bilan-cards').innerHTML = cards || `<div class="no-data">Aucun membre.</div>`
  $('bilan-body').innerHTML  = rows

  document.querySelectorAll('[data-budget-uid]').forEach(btn => {
    btn.onclick = () => openBudgetMvModal(btn.dataset.budgetUid, members[btn.dataset.budgetUid]?.displayName || btn.dataset.budgetUid)
  })
  document.querySelectorAll('[data-hist-uid]').forEach(btn => {
    btn.onclick = () => openHistModal(btn.dataset.histUid, members[btn.dataset.histUid]?.displayName || btn.dataset.histUid)
  })
}

// ── ACTIVER LE BILAN ────────────────────────────────────────────────────────
function openActivateBilanModal() {
  const memberList = Object.entries(members)
  const id = 'activate-bilan-modal'

  const budgetFields = memberList.map(([uid, m]) => `
    <div class="form-group" style="display:flex;align-items:center;gap:.8rem">
      ${avatarHtml(uid, m.displayName, m.photoURL, 28)}
      <label style="flex:1;font-size:.85rem;color:var(--text)">${m.displayName}</label>
      <input type="number" id="budget-init-${uid}" min="0" step="any" placeholder="0"
        style="width:140px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:.5rem .8rem;color:var(--text);font-size:.9rem;outline:none">
    </div>`).join('')

  createModal(id, `
    <h3>⚡ ${t('activate_bilan') || 'Activer le bilan'}</h3>
    <div style="background:#f6ad5522;border:1px solid var(--warn);border-radius:8px;padding:.8rem 1rem;margin-bottom:1.2rem;font-size:.84rem;color:var(--warn)">
      ⚠️ ${t('activate_bilan_warning') || 'Avez-vous déjà collecté le budget de tous les membres ? Cette action est irréversible.'}
    </div>
    <div style="margin-bottom:1rem">
      <div style="font-size:.82rem;color:var(--muted);margin-bottom:.8rem">${t('enter_all_budgets') || 'Saisissez le budget initial de chaque membre :'}</div>
      ${budgetFields}
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
      <button class="btn" style="background:var(--warn);color:#111" id="btn-confirm-activate">✓ ${t('btn_confirm_activate') || "Confirmer l'activation"}</button>
    </div>
  `)
  openModal(id)

  document.getElementById('btn-confirm-activate').onclick = async () => {
    const btn = document.getElementById('btn-confirm-activate')
    try {
      btn.disabled = true; btn.textContent = '⏳ Activation...'

      // Vérification anti-double activation
      const projectSnap = await getDoc(doc(db, 'projects', currentProject.id))
      if (!projectSnap.exists()) { toast(t('err_retry'), 'err'); return }
      if (projectSnap.data().bilanActivated) {
        toast(t('bilan_already_activated') || 'Le bilan est déjà activé.', 'err')
        closeModal(id); return
      }

      // Validation et sauvegarde des budgets
      for (const [uid] of memberList) {
        const input  = document.getElementById(`budget-init-${uid}`)
        const raw    = input?.value?.trim() || ''
        const amount = raw === '' ? 0 : parseFloat(raw)
        if (isNaN(amount) || amount < 0) {
          toast(t('err_invalid_amount') || 'Montant invalide.', 'err')
          input?.focus(); btn.disabled = false
          btn.textContent = `✓ ${t('btn_confirm_activate') || "Confirmer l'activation"}`
          return
        }
        await setDoc(doc(db, 'projects', currentProject.id, 'budgetMovements', uid), { uid }, { merge: true })
        if (amount > 0) {
          await addDoc(collection(db, 'projects', currentProject.id, 'budgetMovements', uid, 'movements'), {
            amount,
            note: t('initial_budget_note') || 'Budget initial',
            modifiedBy: ME.displayName,
            modifiedByUid: ME.uid,
            date: new Date().toLocaleDateString('fr-FR'),
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            soldeApres: amount,
            initial: true
          })
        }
      }

      await updateDoc(doc(db, 'projects', currentProject.id), { bilanActivated: true })
      currentProject.bilanActivated = true
      await loadBudgetMovements()
      closeModal(id)
      toast(t('bilan_activated') || 'Bilan activé ! Les données sont synchronisées.', 'ok')
      renderBilan()
    } catch (e) {
      console.error(e)
      toast(t('err_retry') || 'Une erreur est survenue.', 'err')
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = `✓ ${t('btn_confirm_activate') || "Confirmer l'activation"}` }
    }
  }
}

// ── MEMBRES ────────────────────────────────────────────────────────────────
function renderMembersPage() {
  const mList = Object.entries(members)
  $('members-count').textContent = mList.length
  const grid = $('members-grid')
  if (!mList.length) { grid.innerHTML = `<div class="no-data">Aucun membre.</div>`; return }
  grid.innerHTML = mList.map(([uid, m]) => `
    <div class="member-card">
      ${avatarHtml(uid, m.displayName, m.photoURL, 40)}
      <div class="member-info">
        <div class="member-name">${m.displayName}</div>
        <div class="member-role">${uid === currentProject.adminUid ? '★ Admin' : t('role_member') || 'Membre'} · ${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('fr-FR') : '—'}</div>
      </div>
    </div>`).join('')
}

// ── INVITATION ─────────────────────────────────────────────────────────────
function renderInvite() {
  const code   = currentProject.inviteCode
  const link   = `${window.location.origin}${window.location.pathname}?join=${code}`
  const codeEl = $('invite-code-display')
  const linkEl = $('invite-link-display')
  if (codeEl) { codeEl.textContent = code; codeEl.onclick = () => { navigator.clipboard.writeText(code); toast(t('code_copied') || 'Code copié !', 'ok') } }
  if (linkEl) { linkEl.textContent = link;  linkEl.onclick = () => { navigator.clipboard.writeText(link);  toast(t('link_copied') || 'Lien copié !', 'ok') } }
}

export function openInviteModal() {
  const code = currentProject.inviteCode
  const link = `${window.location.origin}${window.location.pathname}?join=${code}`
  createModal('invite-modal', `
    <h3>🔗 ${t('invite_members') || 'Inviter des membres'}</h3>
    <p class="form-desc">${t('share_code') || 'Partagez ce code ou ce lien :'}</p>
    <div class="invite-code" id="modal-code" style="cursor:pointer">${code}</div>
    <div class="invite-link" id="modal-link" style="cursor:pointer">${link}</div>
    <div class="modal-actions"><button class="btn secondary" onclick="document.getElementById('invite-modal').classList.remove('open')">Fermer</button></div>
  `)
  openModal('invite-modal')
  document.getElementById('modal-code').onclick = () => { navigator.clipboard.writeText(code); toast(t('code_copied') || 'Code copié !', 'ok') }
  document.getElementById('modal-link').onclick = () => { navigator.clipboard.writeText(link);  toast(t('link_copied') || 'Lien copié !', 'ok') }
}

// ── EXPORTS ────────────────────────────────────────────────────────────────
export async function doExportPDF() {
  try {
    await exportPDF({ project: currentProject, depenses, recettes, members, budgetMovements: getBudgetMovements() })
    toast(t('pdf_exported') || 'PDF exporté !', 'ok')
  } catch (e) { toast(t('err_retry'), 'err') }
}

export async function doExportExcel() {
  try {
    await exportExcel({ project: currentProject, depenses, recettes, members, budgetMovements: getBudgetMovements() })
    toast(t('excel_exported') || 'Excel exporté !', 'ok')
  } catch (e) { toast(t('err_retry'), 'err') }
}

// ── PREVIEWS ────────────────────────────────────────────────────────────────
export function initDepPreview() {
  const updatePreview = () => {
    const q  = parseFloat($('dep-qty')?.value)   || 0
    const p  = parseFloat($('dep-price')?.value) || 0
    const n  = Object.keys(members).length || 1
    const el = $('dep-preview')
    if (el) el.textContent = (q && p) ? `Total : ${fmt(q * p, currentProject?.currency)} · Part : ${fmt(q * p / n, currentProject?.currency)}` : ''
  }
  $('dep-qty')?.addEventListener('input', updatePreview)
  $('dep-price')?.addEventListener('input', updatePreview)
}

export function initRecPreview() {
  const el   = $('rec-amount')
  const prev = $('rec-preview')
  if (!el || !prev) return
  el.addEventListener('input', () => {
    const a = parseFloat(el.value) || 0
    const n = Object.keys(members).length || 1
    prev.textContent = a ? `Part : ${fmt(a / n, currentProject?.currency)} / membre` : ''
  })
}

export function initRegenCode() {
  const btn = $('btn-regen-code')
  if (btn) btn.onclick = () => regenerateCode(newCode => {
    currentProject.inviteCode = newCode
    renderInvite()
  })
}

export { renderBilan, renderBilanIfVisible }