import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db, fnCreateProject, fnJoinProject } from './firebase.js'
import { $, avatarHtml, initials, colorForUid, showScreen, toast } from './ui.js'
import { t } from './i18n.js'

let unsubProjects = null
let ME = null
let onOpenProjectCb = null

export function initDashboard(me, onOpenProject) {
  ME = me
  onOpenProjectCb = onOpenProject
  updateDashHeader()
  loadProjects()
}

export function destroyDashboard() {
  if (unsubProjects) { unsubProjects(); unsubProjects = null }
}

function updateDashHeader() {
  $('dash-name').textContent = ME.displayName
  const wrap = $('dash-avatar-wrap')
  wrap.innerHTML = avatarHtml(ME.uid, ME.displayName, ME.photoURL, 32)
}

// ── Projets ────────────────────────────────────────────────────────────────
function loadProjects() {
  if (unsubProjects) unsubProjects()
  const q = query(
    collection(db, 'projects'),
    where(`members.${ME.uid}.uid`, '==', ME.uid)
  )
  unsubProjects = onSnapshot(q,
    snap => {
      const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderProjects(projects)
    },
    err => { console.error(err); toast(t('err_retry'), 'err') }
  )
}

function renderProjects(projects) {
  const grid = $('projects-grid')
  if (!projects.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-icon">📋</div>
      <div class="es-title">${t('no_projects') || 'Aucun projet'}</div>
      <div>${t('no_projects_sub') || 'Créez votre premier projet ou rejoignez-en un.'}</div>
    </div>`
    return
  }
  grid.innerHTML = projects.map(p => {
    const isAdmin = p.adminUid === ME.uid
    const mcount  = Object.keys(p.members || {}).length
    return `<div class="project-card" data-id="${p.id}">
      <div class="pc-header">
        <div class="pc-name">${p.name}</div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <div class="pc-currency">${p.currency}</div>
          <button class="pc-menu-btn" data-menu-id="${p.id}" title="Options">⋮</button>
        </div>
      </div>
      <div class="pc-menu-dropdown" id="menu-${p.id}" style="display:none">
        ${isAdmin
          ? `<div class="pc-menu-item danger" data-action="delete" data-id="${p.id}" data-name="${p.name}">🗑 ${t('delete_project') || 'Supprimer le projet'}</div>`
          : `<div class="pc-menu-item danger" data-action="leave" data-id="${p.id}" data-name="${p.name}">🚪 ${t('leave_project') || 'Quitter le projet'}</div>`
        }
      </div>
      <div class="pc-desc">${p.description || ''}</div>
      <div class="pc-meta">
        <span>👥 ${mcount} membre${mcount > 1 ? 's' : ''}</span>
        <span>📅 ${new Date(p.createdAt).toLocaleDateString('fr-FR')}</span>
      </div>
      <div style="margin-top:.7rem">
        <span class="pc-badge ${isAdmin ? 'admin' : 'member'}">${isAdmin ? '★ Admin' : t('role_member') || 'Membre'}</span>
      </div>
    </div>`
  }).join('')

  // Event listeners
  grid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Ne pas ouvrir si clic sur le menu
      if (e.target.closest('.pc-menu-btn') || e.target.closest('.pc-menu-dropdown')) return
      if (onOpenProjectCb) onOpenProjectCb(card.dataset.id)
    })
  })

  // Menu 3 traits
  grid.querySelectorAll('.pc-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const menuId = btn.dataset.menuId
      const menu = document.getElementById('menu-' + menuId)
      // Fermer tous les autres menus
      document.querySelectorAll('.pc-menu-dropdown').forEach(m => {
        if (m.id !== 'menu-' + menuId) m.style.display = 'none'
      })
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none'
    })
  })

  // Actions menu
  grid.querySelectorAll('.pc-menu-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation()
      document.querySelectorAll('.pc-menu-dropdown').forEach(m => m.style.display = 'none')
      const action = item.dataset.action
      const id     = item.dataset.id
      const name   = item.dataset.name
      if (action === 'delete') openDeleteProjectModal(id, name)
      if (action === 'leave')  openLeaveProjectModal(id, name)
    })
  })

  // Fermer menus au clic extérieur
  document.addEventListener('click', () => {
    document.querySelectorAll('.pc-menu-dropdown').forEach(m => m.style.display = 'none')
  }, { once: false })
}

// ── Créer projet ───────────────────────────────────────────────────────────
export function openCreateModal() {
  import('./ui.js').then(({ createModal, openModal, closeModal }) => {
    const id = 'create-modal'
    createModal(id, `
      <h3>${t('new_project') || '🆕 Nouveau projet'}</h3>
      <div class="form-group"><label>${t('project_name') || 'Nom du projet'}</label><input type="text" id="cp-name" placeholder="${t('placeholder_project_name') || 'Ex: Vacances 2025'}"></div>
      <div class="form-group"><label>${t('project_desc') || 'Description (optionnel)'}</label><input type="text" id="cp-desc"></div>
      <div class="form-group"><label>${t('currency') || 'Monnaie'}</label>
        <select id="cp-currency">
          <option value="FCFA">FCFA</option>
          <option value="EUR">EUR (€)</option>
          <option value="USD">USD ($)</option>
          <option value="GBP">GBP (£)</option>
          <option value="XOF">XOF</option>
          <option value="MAD">MAD</option>
        </select>
      </div>
      <div class="error-msg" id="cp-error"></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
        <button class="btn" id="cp-submit">${t('btn_create') || 'Créer le projet'}</button>
      </div>
    `)
    openModal(id)
    document.getElementById('cp-submit').onclick = async () => {
      const name     = document.getElementById('cp-name').value.trim()
      const desc     = document.getElementById('cp-desc').value.trim()
      const currency = document.getElementById('cp-currency').value
      const err      = document.getElementById('cp-error')
      if (!name) { err.textContent = t('err_name_required') || 'Entrez un nom.'; err.style.display = 'block'; return }
      err.style.display = 'none'
      try {
        await fnCreateProject({ name, description: desc, currency })
        closeModal(id)
        toast(t('proj_created') || 'Projet créé !', 'ok')
      } catch (e) {
        console.error(e)
        err.textContent = e.message || t('err_retry')
        err.style.display = 'block'
      }
    }
  })
}

// ── Rejoindre projet ───────────────────────────────────────────────────────
export function openJoinModal(onSuccess) {
  import('./ui.js').then(({ createModal, openModal, closeModal }) => {
    const id = 'join-modal'
    createModal(id, `
      <h3>${t('join_project') || '🔗 Rejoindre un projet'}</h3>
      <p class="form-desc">${t('join_desc') || 'Entrez le code d\'invitation :'}</p>
      <div class="form-group"><input type="text" id="join-code" placeholder="ABC-XYZ-123" style="text-transform:uppercase;letter-spacing:.15em;font-size:1.1rem;text-align:center"></div>
      <div class="error-msg" id="join-error"></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
        <button class="btn" id="join-submit">${t('btn_join_confirm') || 'Rejoindre'}</button>
      </div>
    `)
    openModal(id)
    document.getElementById('join-submit').onclick = async () => {
      const code = document.getElementById('join-code').value.trim().toUpperCase()
      const err  = document.getElementById('join-error')
      if (!code) { err.textContent = t('err_code_required') || 'Entrez un code.'; err.style.display = 'block'; return }
      err.style.display = 'none'
      try {
        const result = await fnJoinProject({ code })
        const { status, projectId } = result.data
        closeModal(id)
        if (status === 'already_member') {
          if (onSuccess) onSuccess(projectId)
        } else {
          toast(t('join_pending') || 'Demande envoyée ! L\'admin doit approuver votre accès.', 'ok')
        }
      } catch (e) {
        err.textContent = e.message || t('code_invalid') || 'Code invalide.'
        err.style.display = 'block'
      }
    }
  })
}

// ── Supprimer un projet (Admin) ───────────────────────────────────────────
function openDeleteProjectModal(projectId, projectName) {
  import('./ui.js').then(({ createModal, openModal, closeModal, toast }) => {
    import('./i18n.js').then(({ t }) => {
      const id = 'delete-project-modal'
      createModal(id, `
        <h3 style="color:var(--danger)">🗑 ${t('delete_project') || 'Supprimer le projet'}</h3>
        <p style="color:var(--muted);font-size:.85rem;margin-bottom:.8rem">${t('delete_project_warning') || 'Cette action est irréversible. Toutes les données seront perdues.'}</p>
        <div style="background:#f5656522;border:1px solid var(--danger);border-radius:8px;padding:.8rem 1rem;margin-bottom:1.2rem;font-size:.85rem;color:var(--danger)">
          ⚠️ ${t('delete_project_confirm_text') || 'Vous allez supprimer le projet'} : <strong>${projectName}</strong>
        </div>
        <p style="font-size:.84rem;color:var(--muted);margin-bottom:1rem">${t('type_to_confirm') || 'Tapez le nom du projet pour confirmer :'}</p>
        <div class="form-group"><input type="text" id="confirm-project-name" placeholder="${projectName}"></div>
        <div class="error-msg" id="delete-project-error"></div>
        <div class="modal-actions">
          <button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
          <button class="btn danger" id="btn-confirm-delete-project">${t('btn_delete') || 'Supprimer définitivement'}</button>
        </div>
      `)
      openModal(id)

      document.getElementById('btn-confirm-delete-project').onclick = async () => {
        const typed = document.getElementById('confirm-project-name').value.trim()
        const err   = document.getElementById('delete-project-error')
        if (typed !== projectName) {
          err.textContent = t('err_name_mismatch') || 'Le nom ne correspond pas.'
          err.style.display = 'block'
          return
        }
        err.style.display = 'none'
        try {
          const { deleteDoc, doc } = await import('firebase/firestore')
          const { db } = await import('./firebase.js')
          await deleteDoc(doc(db, 'projects', projectId))
          closeModal(id)
          toast(t('project_deleted') || 'Projet supprimé.', 'ok')
        } catch (e) {
          console.error(e)
          err.textContent = t('err_retry') || 'Erreur.'
          err.style.display = 'block'
        }
      }
    })
  })
}

// ── Quitter un projet (Membre) ─────────────────────────────────────────────
function openLeaveProjectModal(projectId, projectName) {
  import('./ui.js').then(({ createModal, openModal, closeModal, toast }) => {
    import('./i18n.js').then(({ t }) => {
      const id = 'leave-project-modal'
      createModal(id, `
        <h3>🚪 ${t('leave_project') || 'Quitter le projet'}</h3>
        <p style="color:var(--muted);font-size:.85rem;margin-bottom:1rem">${t('leave_project_warning') || 'Êtes-vous sûr de vouloir quitter ce projet ?'}</p>
        <div style="background:#f6ad5522;border:1px solid var(--warn);border-radius:8px;padding:.8rem 1rem;margin-bottom:1.2rem;font-size:.85rem;color:var(--warn)">
          ⚠️ ${t('leave_project_confirm_text') || 'Vous allez quitter le projet'} : <strong>${projectName}</strong>
        </div>
        <div class="modal-actions">
          <button class="btn secondary" onclick="document.getElementById('${id}').classList.remove('open')">${t('btn_cancel') || 'Annuler'}</button>
          <button class="btn danger" id="btn-confirm-leave">${t('btn_leave') || 'Quitter le projet'}</button>
        </div>
      `)
      openModal(id)

      document.getElementById('btn-confirm-leave').onclick = async () => {
        try {
          const { updateDoc, doc, deleteDoc } = await import('firebase/firestore')
          const { db } = await import('./firebase.js')
          const { auth } = await import('./firebase.js')
          const uid = auth.currentUser.uid
          // Retirer le membre du projet
          await updateDoc(doc(db, 'projects', projectId), {
            [`members.${uid}`]: null
          })
          // Supprimer ses budgetMovements
          await deleteDoc(doc(db, 'projects', projectId, 'budgetMovements', uid))
          closeModal(id)
          toast(t('project_left') || 'Vous avez quitté le projet.', 'ok')
        } catch (e) {
          console.error(e)
          toast(t('err_retry') || 'Erreur.', 'err')
        }
      }
    })
  })
}

// ── Rejoindre via URL ─────────────────────────────────────────────────────
export async function handleUrlJoin(code, onSuccess) {
  try {
    const result = await fnJoinProject({ code: code.toUpperCase() })
    const { status, projectId } = result.data
    window.history.replaceState({}, '', window.location.pathname)
    if (status === 'already_member' && onSuccess) onSuccess(projectId)
    else toast(t('join_pending') || 'Demande envoyée ! L\'admin doit approuver votre accès.', 'ok')
  } catch (e) {
    console.error(e)
    window.history.replaceState({}, '', window.location.pathname)
  }
}