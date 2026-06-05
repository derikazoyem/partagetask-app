import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { storage, db } from './firebase.js'
import { toast } from './ui.js'
import { t } from './i18n.js'

const ALLOWED_TYPES = ['image/jpeg','image/jpg','image/png','image/gif','image/webp','image/heic','image/heif','application/pdf']
const ALLOWED_EXT   = ['.jpg','.jpeg','.png','.gif','.webp','.heic','.heif','.pdf']
const MAX_SIZE_MB   = 10
const MAX_SIZE_B    = MAX_SIZE_MB * 1024 * 1024
const MAX_FILES     = 10

export function validateFiles(files, existingCount = 0) {
  const valid = []
  const errors = []
  if (existingCount + files.length > MAX_FILES) {
    errors.push(`Maximum ${MAX_FILES} fichiers par dépense (${existingCount} déjà joints).`)
    return { valid: [], errors }
  }
  for (const file of files) {
    const ext    = '.' + file.name.split('.').pop().toLowerCase()
    const typeOk = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXT.includes(ext)
    const sizeOk = file.size <= MAX_SIZE_B
    const nameOk = !file.name.includes('..') && file.name.length < 200
    if (!typeOk)  errors.push(`❌ ${file.name} — type non autorisé (images et PDF uniquement)`)
    else if (!sizeOk) errors.push(`❌ ${file.name} — trop volumineux (max ${MAX_SIZE_MB} Mo)`)
    else if (!nameOk) errors.push(`❌ ${file.name} — nom invalide`)
    else valid.push(file)
  }
  return { valid, errors }
}

export async function uploadFiles({ files, projectId, depId, existing, onProgress, onComplete }) {
  const { valid, errors } = validateFiles(files, existing.length)
  if (errors.length) {
    errors.forEach(e => toast(e, 'err'))
    if (!valid.length) return
  }
  const results = [...existing]
  let done = 0
  for (const file of valid) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storRef  = ref(storage, `projects/${projectId}/${depId}/${Date.now()}_${safeName}`)
    if (onProgress) onProgress(done, valid.length, file.name)
    await new Promise((res, rej) => {
      const task = uploadBytesResumable(storRef, file)
      task.on('state_changed',
        snap => { if (onProgress) onProgress(done, valid.length, file.name, snap.bytesTransferred / snap.totalBytes) },
        rej,
        async () => {
          const url = await getDownloadURL(storRef)
          results.push({ name: file.name, safeName, url, path: storRef.fullPath, size: file.size, type: file.type, uploadedAt: Date.now() })
          res()
        }
      )
    })
    done++
  }
  await updateDoc(doc(db, 'projects', projectId, 'tasks', depId), { files: results })
  if (onComplete) onComplete(results)
  toast(`${done} fichier(s) ajouté(s)`, 'ok')
  return results
}

export async function deleteFile({ projectId, depId, files, index }) {
  const file = files[index]
  if (!file) return
  try {
    if (file.path) await deleteObject(ref(storage, file.path))
    const updated = files.filter((_, i) => i !== index)
    await updateDoc(doc(db, 'projects', projectId, 'tasks', depId), { files: updated })
    toast(t('file_deleted') || 'Fichier supprimé.', 'ok')
    return updated
  } catch (e) {
    console.error(e)
    toast('Erreur suppression fichier.', 'err')
  }
}

export function renderFilesList(files, { depId, projectId, onDelete, isAdmin }) {
  if (!files.length) return `<div style="text-align:center;padding:.8rem;color:var(--muted);font-size:.82rem">Aucun fichier joint</div>`
  return files.map((f, i) => {
    const isPdf  = f.name?.toLowerCase().endsWith('.pdf')
    const sizeKo = f.size ? ` · ${(f.size / 1024).toFixed(0)} Ko` : ''
    const delBtn = isAdmin ? `<button data-del="${i}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:.85rem;flex-shrink:0;margin-left:.3rem">🗑</button>` : ''
    return `<div class="file-item">
      <div style="display:flex;align-items:center;gap:.5rem;flex:1;min-width:0">
        <span>${isPdf ? '📄' : '🖼️'}</span>
        <div style="min-width:0;flex:1">
          <a href="${f.url}" target="_blank" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</a>
          <div style="font-size:.7rem;color:var(--muted)">${sizeKo}</div>
        </div>
      </div>
      <span class="file-badge ${isPdf ? 'pdf' : 'img'}">${isPdf ? 'PDF' : 'IMG'}</span>
      ${delBtn}
    </div>`
  }).join('')
}
