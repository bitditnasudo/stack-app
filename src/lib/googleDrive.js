/* ============================================================================
   GOOGLE DRIVE — the same scaffolding the Plant Tracker uses.
   ============================================================================
   OAuth implicit-redirect flow, the shared Vantarco OAuth client, one JSON file
   holding the whole app state. Ported from `PLANT TRACKER/src/lib/googleDrive.js`
   so the two apps stay recognisably the same thing; the differences are noted
   where they occur and each has a reason.

   WHAT IS DIFFERENT FROM THE PLANT TRACKER

   1. No calendar scope. Plant Tracker writes watering events; STACK's reminders
      are in-page timers and it has no business asking for a calendar.

   2. The folder is PINNED BY ID, not found by name. Plant Tracker creates a
      "PLANT TRACKER" folder and owns it. STACK was pointed at a folder that
      already existed — "STACK APP" — so it resolves that id first and only
      falls back to creating its own. See `resolveFolder` for the catch, which
      is the one genuinely tricky thing in this file.

   3. No resumable upload. That exists in Plant Tracker because a floor-plan
      image can pass the 5 MB simple-upload cap. STACK's payload is a JSON
      checklist — a decade of daily logs is well under a megabyte — so the
      simple multipart upload is used and there is no upload session to babysit.

   THE TOKEN LIVES IN localStorage AND THE CLIENT ID IS IN THE BUNDLE. Both are
   true of Plant Tracker too, and both are fine for a single-user personal app
   on a personal Drive. It is why the scope below is kept as narrow as it can be.
   ========================================================================== */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

/* drive.file — per-file access: only files THIS APP created, plus anything the
   user explicitly hands it. It is the narrowest scope that can write to Drive
   at all, and it cannot read the rest of the Drive it is signed into.

   The catch, and it is the reason `resolveFolder` is shaped the way it is: a
   folder the user made by hand in the Drive UI was not created by this app, so
   drive.file may not be able to see it. Google's sanctioned way to hand a
   pre-existing folder to a drive.file app is the Picker.

   The alternative is the full `https://www.googleapis.com/auth/drive` scope,
   which reaches any folder by id — at the cost of read/write over the ENTIRE
   Drive, for a token sitting in localStorage. That trade is not this file's to
   make silently; swapping this one line is all it would take. */
const SCOPES = 'https://www.googleapis.com/auth/drive.file'

export const SYNC_FILE_NAME = 'stack-sync.json'

/* The folder this app was pointed at. Env rather than a literal so the id is
   not baked into the source of a repo that is pushed to GitHub. */
const FOLDER_ID = import.meta.env.VITE_GDRIVE_FOLDER_ID || ''
/* Fallback name, used only if the pinned folder cannot be reached. Matches the
   pinned folder's real name so the two are obviously the same intent. */
const FOLDER_NAME = 'STACK APP'

/* Token keys are prefixed per app: the Vantarco apps share localhost origins in
   dev, and an unprefixed `g_token` meant signing into one signed you out of
   the other. Same lesson as Plant Tracker's `pt_` prefix. */
const TK = 'stack_g_token'
const TE = 'stack_g_expiry'

let _token = null
let _expiry = 0

export function getStoredToken() {
  if (_token && Date.now() < _expiry) return _token
  const t = localStorage.getItem(TK)
  const e = Number(localStorage.getItem(TE) || 0)
  if (t && Date.now() < e) { _token = t; _expiry = e; return t }
  return null
}

export function storeToken(token, expiresIn) {
  _token = token
  // a minute of slack, so a request started just before expiry cannot land after it
  _expiry = Date.now() + Number(expiresIn) * 1000 - 60000
  localStorage.setItem(TK, token)
  localStorage.setItem(TE, String(_expiry))
}

export function clearToken() {
  _token = null
  _folder = null              // the next sign-in may be a different account
  localStorage.removeItem(TK)
  localStorage.removeItem(TE)
}

export function isAuthenticated() { return !!getStoredToken() }
export function isConfigured() { return !!CLIENT_ID }

export function signIn() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin + '/auth/callback',
    response_type: 'token',
    scope: SCOPES,
    prompt: 'select_account',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export class AuthExpiredError extends Error {
  constructor() { super('Google session expired'); this.name = 'AuthExpiredError' }
}

async function driveFetch(url, options = {}, raw = false) {
  const token = getStoredToken()
  if (!token) throw new AuthExpiredError()
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (res.status === 401) {
    clearToken()
    throw new AuthExpiredError()
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const e = new Error(err?.error?.message || `Drive HTTP ${res.status}`)
    e.status = res.status
    throw e
  }
  return raw ? res : res.json()
}

/* ── Folder ──────────────────────────────────────────────────────────────────
   Resolved once per session and cached, because every push would otherwise
   spend a round trip re-deciding the same thing. */
let _folder = null   // { id, pinned }

/**
 * Which folder the sync file lives in.
 *
 * Tries the pinned id first. If Drive says it cannot see it — which is exactly
 * what `drive.file` is supposed to do for a folder this app did not create —
 * it falls back to finding or creating a folder of its own by name.
 *
 * The fallback is not a workaround being hidden: `pinned` is returned so the
 * Settings screen can say WHICH folder it is actually writing to and link
 * straight to it. A sync that silently wrote somewhere other than where the
 * user pointed it would be worse than one that failed.
 */
export async function resolveFolder() {
  if (_folder) return _folder

  if (FOLDER_ID) {
    try {
      const f = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${FOLDER_ID}?fields=id,name,capabilities(canAddChildren)`,
      )
      if (f?.id && f.capabilities?.canAddChildren !== false) {
        _folder = { id: f.id, name: f.name, pinned: true }
        return _folder
      }
    } catch (e) {
      // 401 means the session died, which is not a folder problem — let it out.
      if (e instanceof AuthExpiredError) throw e
      // 404/403 is the drive.file case described at the top. Fall through.
    }
  }

  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
  )
  const data = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`)
  if (data.files?.[0]) {
    _folder = { id: data.files[0].id, name: data.files[0].name, pinned: false }
    return _folder
  }

  const created = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  _folder = { id: created.id, name: created.name, pinned: false }
  return _folder
}

export function folderUrl(id) { return `https://drive.google.com/drive/folders/${id}` }

/* ── The sync file ───────────────────────────────────────────────────────── */

/** Look for the sync file INSIDE the resolved folder, not Drive-wide.
 *  Plant Tracker searches by name alone; scoping to the folder means a stray
 *  copy elsewhere in the Drive can never be picked up as the live one. */
export async function findSyncFile() {
  const folder = await resolveFolder()
  const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and '${folder.id}' in parents and trashed=false`)
  const data = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`,
  )
  return data.files?.[0] || null
}

/* Multipart upload: metadata part + content part in one request. Good to 5 MB,
   which this payload will not approach — see the header note. */
function multipart(metadata, jsonString) {
  const boundary = 'stack' + Math.random().toString(36).slice(2)
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonString}\r\n` +
    `--${boundary}--`
  return { body, contentType: `multipart/related; boundary=${boundary}` }
}

export async function createSyncFile(jsonString) {
  const folder = await resolveFolder()
  const { body, contentType } = multipart(
    { name: SYNC_FILE_NAME, parents: [folder.id], mimeType: 'application/json' },
    jsonString,
  )
  const created = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { 'Content-Type': contentType }, body },
  )
  return created.id
}

export async function updateSyncFile(fileId, jsonString) {
  // No `parents` on update — Drive rejects it here, and the file is already
  // where it belongs.
  const { body, contentType } = multipart({}, jsonString)
  return driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`,
    { method: 'PATCH', headers: { 'Content-Type': contentType }, body },
  )
}

export async function downloadSyncFile(fileId) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, true)
  return res.json()
}
