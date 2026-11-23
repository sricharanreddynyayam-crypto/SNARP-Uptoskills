import { safeNext } from './password.js'

const KEY = 'snarp:signup-return'
const VERIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000

export function rememberSignupReturn(email, next) {
  try {
    if (next === '/') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({
      email: email.trim().toLowerCase(),
      next: safeNext(next),
      expiresAt: Date.now() + VERIFICATION_WINDOW_MS,
    }))
  } catch {}
}

export function takeSignupReturn(email) {
  if (!email) return '/'
  try {
    const pending = JSON.parse(localStorage.getItem(KEY))
    if (pending?.email === email.trim().toLowerCase()) {
      localStorage.removeItem(KEY)
      if (pending.expiresAt > Date.now()) return safeNext(pending.next)
    }
  } catch {}
  return '/'
}
