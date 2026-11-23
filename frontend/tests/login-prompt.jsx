import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import LoginPrompt from '../src/components/LoginPrompt'
import { useLoginPrompt } from '../src/useLoginPrompt'
import '../src/index.css'
import '../src/theme-breeze.css'

const NAVIGATION_TIMEOUT_MS = 2000
const destination = '/feed?scope=everyone#post-42'
const message = 'Log in or sign up to interact with posts.'
const fixture = document.getElementById('fixture')
const results = document.getElementById('results')
const select = (selector) => document.querySelector(selector)
const dialog = () => select('[role=dialog]')
const click = (element) => flushSync(() => element.click())
const key = (name, options) => flushSync(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
  key: name, bubbles: true, cancelable: true, ...options,
})))
const pointer = (element) => flushSync(() => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
let attempts = 0

// eslint-disable-next-line react-refresh/only-export-components -- This browser test mounts its own fixture.
function Fixture({ authenticated }) {
  const { requireAuth, promptProps } = useLoginPrompt(authenticated)
  const { pathname, search } = useLocation()
  return (
    <div className="shell">
      <output id="location">{pathname}{search}</output>
      <button id="trigger" onClick={(event) => requireAuth(() => { attempts += 1 }, event.currentTarget)}>Like post</button>
      <button id="outside">Outside</button>
      <LoginPrompt {...promptProps} />
    </div>
  )
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function open() {
  click(select('#trigger'))
  expect(dialog(), 'The guest action should open a dialog')
  expect(attempts === 0, 'The protected action should wait for sign-in')
}

function expectClosed() {
  expect(!dialog(), 'The prompt should close')
  expect(document.activeElement === select('#trigger'), 'Focus should return to the opener')
}

async function expectNavigation(path) {
  const expected = `${path}?next=${encodeURIComponent(destination)}`
  click(select(`.login-prompt a[href^="${path}"]`))
  const route = select('#location')
  if (route.textContent !== expected) {
    await new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (route.textContent !== expected) return
        clearTimeout(timeout)
        observer.disconnect()
        resolve()
      })
      const timeout = setTimeout(() => {
        observer.disconnect()
        reject(new Error(`Timed out waiting for ${expected} (current route: ${route.textContent})`))
      }, NAVIGATION_TIMEOUT_MS)
      observer.observe(route, { childList: true, subtree: true, characterData: true })
    })
  }
  expect(!dialog(), 'Selecting an auth page should close the prompt')
}

const cases = [
  ['opens a labelled modal and focuses Log In', () => {
    open()
    expect(dialog().getAttribute('aria-modal') === 'true', 'Missing modal semantics')
    expect(document.getElementById(dialog().getAttribute('aria-labelledby'))?.textContent === 'Join the conversation', 'Missing accessible title')
    expect(document.getElementById(dialog().getAttribute('aria-describedby'))?.textContent === message, 'Missing accessible description')
    expect(document.activeElement.textContent === 'Log In', 'Initial focus should be on Log In')
  }],
  ['closes with X and restores focus', () => {
    open()
    click(select('[aria-label="Close login prompt"]'))
    expectClosed()
  }],
  ['closes with Escape and restores focus', () => {
    open()
    key('Escape')
    expectClosed()
  }],
  ['closes on a simulated backdrop click and restores focus', () => {
    open()
    const backdrop = select('.login-prompt')
    pointer(backdrop)
    expect(dialog(), 'Pressing down on the backdrop should not close the dialog yet')
    click(backdrop)
    expectClosed()
  }],
  ['stays open when clicked inside', () => {
    open()
    pointer(dialog().querySelector('p'))
    click(dialog().querySelector('p'))
    expect(dialog(), 'Clicking inside closed the dialog')
  }],
  ['contains focus and wraps Tab in both directions', async () => {
    open()
    const close = select('[aria-label="Close login prompt"]')
    const signup = select('.login-prompt a[href^="/signup"]')
    signup.focus()
    key('Tab')
    expect(document.activeElement === close, 'Tab should wrap to the first control')
    key('Tab', { shiftKey: true })
    expect(document.activeElement === signup, 'Shift+Tab should wrap to the last control')
    select('#outside').focus()
    await Promise.resolve()
    expect(dialog().contains(document.activeElement), 'Focus escaped the modal')
  }],
  ['navigates to Log In with the full return route', async () => { open(); await expectNavigation('/login') }],
  ['navigates to Sign Up with the full return route', async () => { open(); await expectNavigation('/signup') }],
  ['runs the protected action immediately for members', () => {
    click(select('#trigger'))
    expect(attempts === 1 && !dialog(), 'Members should run the action without a prompt')
  }, true],
]

async function runFixtureTests() {
  const summary = []
  results.textContent = `Running ${cases.length} browser tests…`
  for (const [name, run, authenticated = false] of cases) {
    const root = createRoot(fixture)
    attempts = 0
    try {
      flushSync(() => root.render(<MemoryRouter initialEntries={[destination]}><Fixture authenticated={authenticated} /></MemoryRouter>))
      await run()
      summary.push(`PASS ${name}`)
    } catch (error) {
      summary.push(`FAIL ${name}: ${error.message}`)
    } finally {
      root.unmount()
    }
    results.textContent = summary.join('\n')
  }
  results.dataset.status = summary.some((line) => line.startsWith('FAIL ')) ? 'fail' : 'pass'
}

if (new URLSearchParams(location.search).has('native')) {
  const root = createRoot(fixture)
  flushSync(() => root.render(<MemoryRouter initialEntries={[destination]}><Fixture authenticated={false} /></MemoryRouter>))
  results.textContent = 'Native input fixture ready.'
  results.dataset.status = 'ready'
} else {
  await runFixtureTests()
}
