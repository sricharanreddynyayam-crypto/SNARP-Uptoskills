import { useId, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { X } from '@phosphor-icons/react'
import { safeNext } from '../password'
import { Overlay } from './Overlay'

export default function LoginPrompt({ open, onClose, returnFocus }) {
  const id = useId()
  const loginRef = useRef(null)
  const { pathname, search, hash } = useLocation()
  const next = encodeURIComponent(safeNext(`${pathname}${search}${hash}`))

  if (!open) return null

  return (
    <Overlay className="login-prompt" labelledBy={`${id}-title`} describedBy={`${id}-description`}
      onClose={onClose} trapFocus initialFocusRef={loginRef} returnFocus={returnFocus}>
      <header className="login-prompt-header">
        <h2 id={`${id}-title`}>Join the conversation</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close login prompt"><X size={18} /></button>
      </header>
      <p id={`${id}-description`}>Log in or sign up to interact with posts.</p>
      <div className="login-prompt-actions">
        <Link to={`/login?next=${next}`} ref={loginRef} className="btn btn-primary" onClick={onClose}>Log In</Link>
        <Link to={`/signup?next=${next}`} className="btn btn-ghost" onClick={onClose}>Sign Up</Link>
      </div>
    </Overlay>
  )
}
