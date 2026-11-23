import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowSquareOut, DownloadSimple, FilePdf, X } from '@phosphor-icons/react'

const openPanels = []
const focusableSelector = 'a[href], button, input, select, textarea, [tabindex]'

function makeBackgroundInert(layer) {
  const changed = []
  for (let node = layer; node && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue
      sibling.inert = true
      changed.push(sibling)
    }
  }
  return () => { changed.forEach((element) => { element.inert = false }) }
}

// A modal layer rendered inside the app shell so it keeps the theme. Closes on Escape or a click on the backdrop,
// locks page scrolling while open and gives focus back to whatever opened it.
export function Overlay({ className = '', label, labelledBy, describedBy, onClose, children, trapFocus = false, initialFocusRef, returnFocus }) {
  const panelRef = useRef(null)
  const backdropPressed = useRef(false)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    const panel = panelRef.current
    const opener = returnFocus ?? document.activeElement
    const isTop = () => openPanels.at(-1) === panel
    const focusable = () => Array.from(panel.querySelectorAll(focusableSelector)).filter((element) => (
      element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible'
    ))
    openPanels.push(panel)
    document.documentElement.classList.add('overlay-open')
    const restoreBackground = trapFocus ? makeBackgroundInert(panel.parentElement) : null
    const key = (event) => {
      if (!isTop()) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      }
      if (!trapFocus || event.key !== 'Tab') return
      const targets = focusable()
      const active = document.activeElement
      const edge = event.shiftKey ? targets[0] : targets.at(-1)
      if (active === edge || !targets.includes(active)) {
        event.preventDefault()
        const target = (event.shiftKey ? targets.at(-1) : targets[0]) ?? panel
        target.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', key)
    const initialFocus = initialFocusRef?.current ?? panel
    initialFocus.focus({ preventScroll: true })
    return () => {
      const wasTop = isTop()
      document.removeEventListener('keydown', key)
      restoreBackground?.()
      openPanels.splice(openPanels.indexOf(panel), 1)
      if (openPanels.length === 0) document.documentElement.classList.remove('overlay-open')
      if (wasTop && opener?.isConnected) opener.focus?.({ preventScroll: true })
    }
  }, [initialFocusRef, returnFocus, trapFocus])

  const dismissBackdrop = (event) => {
    const clickedBackdrop = backdropPressed.current && event.target === event.currentTarget
    backdropPressed.current = false
    // The native pointer focus change must finish before closing restores focus.
    if (clickedBackdrop) onClose()
  }

  return createPortal(
    <div
      className={`overlay ${className}`}
      onPointerDown={(event) => { backdropPressed.current = event.target === event.currentTarget }}
      onPointerUp={(event) => { if (event.target !== event.currentTarget) backdropPressed.current = false }}
      onClick={dismissBackdrop}
    >
      <div ref={panelRef} className="overlay-panel" role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.querySelector('.shell') ?? document.body,
  )
}

export function PdfReader({ url, title, filename = 'paper.pdf', onClose }) {
  return (
    <Overlay className="pdf-reader" label={`PDF: ${title ?? filename}`} onClose={onClose}>
      <header className="pdf-reader-head">
        <span className="pdf-reader-icon" aria-hidden="true"><FilePdf size={20} weight="duotone" /></span>
        <span className="pdf-reader-title">
          <strong title={title ?? filename}>{title ?? filename}</strong>
          {title && <small>{filename}</small>}
        </span>
        <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title="Open in a new tab" aria-label="Open in a new tab"><ArrowSquareOut size={18} /></a>
        <a className="icon-btn" href={url} download={filename} title="Download" aria-label={`Download ${filename}`}><DownloadSimple size={18} /></a>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close PDF" title="Close"><X size={18} /></button>
      </header>
      <iframe className="pdf-reader-frame" title={`PDF: ${title ?? filename}`} src={url} />
    </Overlay>
  )
}
