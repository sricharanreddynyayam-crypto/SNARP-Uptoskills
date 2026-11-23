// With Vite running: node --test tests/feed-auth.native.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitFor, withChrome } from './chrome.mjs'

function installTestApi() {
  const originalFetch = window.fetch.bind(window)
  const holds = new Map()
  const pending = new Map()
  const now = '2026-01-01T10:00:00Z'
  const user = { id: 10, name: 'Fixture Member', email: 'fixture@example.test', role: 'user' }
  const post = { id: 42, type: 'post', user_id: 20, author_name: 'Fixture Author', body: 'Public fixture post', created_at: now, like_count: 2, liked_by_me: false, comment_count: 1 }
  const paper = { id: 42, type: 'paper', title: 'Published fixture paper', abstract: 'Fixture abstract', author_name: 'Fixture Author', created_at: now }
  const comment = (body) => ({ id: 1, body, author_name: 'Fixture Commenter', created_at: now })
  window.qa = {
    calls: [], shares: [], copiedLinks: [], publicFeedBlocked: true, commentBody: 'New comment snapshot',
    verificationUnavailable: new URLSearchParams(location.search).has('retry'),
    hold: (key) => holds.set(key, true),
    pending: (key) => pending.has(key),
    release: (key) => { pending.get(key)?.(); pending.delete(key) },
  }
  Object.defineProperty(navigator, 'share', { configurable: true, value: async (data) => window.qa.shares.push(data) })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (url) => window.qa.copiedLinks.push(url) } })
  const respond = (key, data, status = 200) => {
    const response = status === 204 ? new Response(null, { status }) : Response.json(data, { status })
    if (!holds.delete(key)) return Promise.resolve(response)
    // A response may already be in flight at cancellation. Deliberately resolve it anyway.
    return new Promise((resolve) => pending.set(key, () => resolve(response)))
  }
  window.fetch = (url, options = {}) => {
    const path = new URL(url, location.origin)
    if (!path.pathname.startsWith('/api/')) return originalFetch(url, options)
    const method = options.method ?? 'GET'
    const bearer = options.headers?.Authorization
    const member = bearer === 'Bearer fixture-member'
    const { pathname } = path
    window.qa.calls.push({ method, pathname, query: path.search, bearer, body: typeof options.body === 'string' ? JSON.parse(options.body) : null })
    if (pathname === '/api/auth/login') return respond('login', { token: 'fixture-member', user })
    if (pathname === '/api/auth/signup') return respond('signup', { verification_required: true, email: user.email, email_sent: true }, 201)
    if (pathname === '/api/auth/verify-email') return window.qa.verificationUnavailable
      ? respond('verify', { error: 'Fixture unavailable' }, 503)
      : respond('verify', { token: 'fixture-member', user })
    if (member && window.qa.memberExpired) return respond('expired', { error: 'Please log in again' }, 401)
    if (pathname === '/api/posts' && method === 'GET') {
      if (!member && window.qa.publicFeedBlocked) return respond('guest-feed', { error: 'Authentication required' }, 401)
      const page = Number(path.searchParams.get('page'))
      const following = path.searchParams.get('scope') === 'following'
      if (following) return window.qa.failFollowing
        ? respond('following', { error: 'Fixture Following failed' }, 503)
        : respond('following', { items: [post], page, hasMore: false })
      const items = page === 1 ? [post, post] : member ? [{ ...post, id: 88, body: 'Stale everyone page' }] : [paper, paper]
      return respond(member ? 'member-page-' + page : 'guest-page-' + page, { items, page, hasMore: page === 1 })
    }
    if (pathname === '/api/posts/42/comments' && method === 'GET') {
      return respond('comments', [comment(window.qa.commentBody)])
    }
    if (!member) return respond('protected', { error: 'Authentication required' }, 401)
    if (pathname === '/api/auth/me') return respond('me', user)
    if (pathname === '/api/auth/logout' || pathname === '/api/views') return respond('write', null, 204)
    if (pathname === '/api/posts/42/like') return respond('like', { liked_by_me: true, like_count: 3 })
    if (pathname === '/api/posts/42/comments') return respond('post-comment', { ...comment(JSON.parse(options.body).body), id: 2, user_id: user.id }, 201)
    if (pathname === '/api/posts' && method === 'POST') return respond('post', { ...post, id: 99, body: options.body.get('body') }, 201)
    if (pathname === '/api/papers/featured') return respond('featured', null)
    if (pathname === '/api/reels') return respond('reels', { items: [], next: null })
    if (pathname === '/api/citations/dashboard') return respond('citations', {})
    if (pathname === '/api/notifications/unread-count') return respond('unread', { messages: 0, notifications: 0 })
    return respond('other', [])
  }
}

const site = process.env.SNARP_APP_URL ?? 'http://localhost:5173'
const selector = (value) => 'document.querySelector(' + JSON.stringify(value) + ')'
const text = (value) => 'document.body.innerText.includes(' + JSON.stringify(value) + ')'

test('SNARP guest, feed and auth regressions with an isolated browser API fixture', { timeout: 90000 }, async () => withChrome(async ({ input, evaluate }) => {
  const visible = (query) => waitFor(evaluate, '!!' + selector(query))
  const click = (query) => evaluate(selector(query) + '.click()')
  const pressKey = async (key) => {
    await input('Input.dispatchKeyEvent', { type: 'keyDown', key })
    await input('Input.dispatchKeyEvent', { type: 'keyUp', key })
  }
  const fill = (query, value) => evaluate('((element, value) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); })(' + selector(query) + ',' + JSON.stringify(value) + ')')
  const delayResponse = (key) => evaluate('window.qa.hold(' + JSON.stringify(key) + ')')
  const pending = (key) => waitFor(evaluate, 'window.qa.pending(' + JSON.stringify(key) + ')')
  const release = (key) => evaluate('window.qa.release(' + JSON.stringify(key) + ')')
  const go = (route) => input('Page.navigate', { url: new URL(route, site).href })
  const viewport = (width, height) => input('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 1000 })
  await input('Page.addScriptToEvaluateOnNewDocument', { source: '(' + installTestApi.toString() + ')()' })
  await viewport(1280, 800)
  await go('/submit?draft=1#upload')
  await visible('#email')
  assert.equal(await evaluate('new URLSearchParams(location.search).get("next")'), '/submit?draft=1#upload')
  await go('/feed?scope=everyone#post-42')
  await waitFor(evaluate, '!!window.qa')
  await waitFor(evaluate, text('Could not load the public feed'))
  assert.equal(await evaluate('location.pathname'), '/feed')
  await evaluate('window.qa.publicFeedBlocked = false')
  await delayResponse('guest-page-2')
  await click('.feed .alert + button')
  await visible('#post-42')
  assert.equal(await evaluate('document.querySelectorAll("#post-42").length'), 1)
  await evaluate('[...document.querySelectorAll(".feed-kinds button")].find(button => button.textContent === "Papers").click()')
  await pending('guest-page-2')
  assert.equal(await evaluate(text('No approved papers yet')), false)
  assert.equal(await evaluate(text('Checking the next page')), true)
  await release('guest-page-2')
  await visible('#paper-42')
  assert.equal(await evaluate('document.querySelectorAll("#paper-42").length'), 1)
  assert.equal(await evaluate('!!document.querySelector("#paper-42 .post-actions button")'), false)
  await evaluate('[...document.querySelectorAll(".feed-kinds button")].find(button => button.textContent === "Posts").click()')
  await visible('#post-42')
  await evaluate('window.qa.commentBody = "Stale comment snapshot"')
  await delayResponse('comments')
  await click('#post-42 button[title=Comments]')
  await pending('comments')
  await click('button[aria-label="Close comments"]')
  await evaluate('window.qa.commentBody = "Current comment snapshot"')
  await click('#post-42 button[title=Comments]')
  await waitFor(evaluate, text('Current comment snapshot'))
  await release('comments')
  assert.equal(await evaluate(text('Stale comment snapshot')), false)
  assert.equal(await evaluate('!!document.querySelector("form.comments-sheet-form")'), false)

  const prompt = '.login-prompt [role=dialog]'
  const writeComment = '.comments-sheet footer button'
  const sharePost = '#post-42 button[title=Share]'
  assert.equal(await evaluate(`!!${selector(prompt)}`), false)
  await click(writeComment)
  await visible(`${prompt}[aria-modal=true]`)
  assert.equal(await evaluate(`document.getElementById(${selector(prompt)}.getAttribute('aria-labelledby')).textContent`), 'Join the conversation')
  assert.equal(await evaluate('document.activeElement.textContent'), 'Log In')
  assert.equal(await evaluate('document.querySelector(".comments-sheet").inert'), true)
  await evaluate(selector('.login-prompt a[href^="/signup"]') + '.focus()')
  await pressKey('Tab')
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close login prompt')
  await pressKey('Escape')
  await waitFor(evaluate, `!${selector(prompt)}`)
  assert.equal(await evaluate(`document.activeElement === ${selector(writeComment)}`), true)
  assert.equal(await evaluate(text('Current comment snapshot')), true)
  await click('button[aria-label="Close comments"]')

  await click(sharePost)
  await visible(prompt)
  await input('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 })
  await input('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 })
  await waitFor(evaluate, `!${selector(prompt)}`)
  assert.equal(await evaluate(`document.activeElement === ${selector(sharePost)}`), true)
  assert.deepEqual(await evaluate('[window.qa.shares, window.qa.copiedLinks]'), [[], []])

  for (const [width, height] of [[1280, 800], [768, 1024], [390, 844]]) {
    await viewport(width, height)
    await click('#post-42 button[title=Like]')
    await visible('.login-prompt [role=dialog]')
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    const bounds = await evaluate('(() => { const box = document.querySelector(".login-prompt .overlay-panel").getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight })()')
    assert.ok(bounds, 'Guest prompt outside viewport at width ' + width)
    await click('.login-prompt button[aria-label="Close login prompt"]')
  }
  const publicCalls = await evaluate('window.qa.calls')
  assert.ok(publicCalls.every((call) => call.method === 'GET' && !call.bearer))

  await click('#post-42 button[title=Like]')
  await click('.login-prompt a[href^="/login"]')
  await visible('#email')
  await typeLogin()
  await delayResponse('login')
  await click('.auth-form button[type=submit]')
  await pending('login')
  await click('.auth-switch a')
  await visible('#name')
  await release('login')
  assert.equal(await evaluate('location.pathname'), '/signup')

  await click('.auth-switch a')
  await visible('#email')
  await typeLogin()
  await delayResponse('member-page-2')
  await click('.auth-form button[type=submit]')
  await visible('.composer')
  assert.equal(await evaluate('location.pathname + location.search + location.hash'), '/feed?scope=everyone#post-42')
  await pending('member-page-2')
  for (const [width, height] of [[1280, 800], [768, 1024], [390, 844]]) {
    await viewport(width, height)
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Member feed overflows at width ' + width)
  }
  await evaluate('window.qa.failFollowing = true; [...document.querySelectorAll(".feed-toggle button")].find(button => button.textContent === "Following").click()')
  await waitFor(evaluate, text('Fixture Following failed'))
  assert.equal(await evaluate('!!document.querySelector("#post-42")'), false)
  await release('member-page-2')
  assert.equal(await evaluate(text('Stale everyone page')), false)
  await evaluate('window.qa.failFollowing = false')
  await click('.feed .alert + button')
  await visible('#post-42')
  assert.equal(await evaluate('document.querySelector(".feed-toggle button[aria-pressed=true]").textContent'), 'Following')

  await click('#post-42 button[title=Like]')
  await visible('#post-42 button[title=Unlike]')
  await delayResponse('comments')
  await click('#post-42 button[title=Comments]')
  await pending('comments')
  await fill('.comments-sheet-form input', 'Member fixture comment')
  assert.equal(await evaluate('document.querySelector(".comments-sheet-form button").disabled'), true)
  await release('comments')
  await waitFor(evaluate, '!document.querySelector(".comments-sheet-form button").disabled')
  await click('.comments-sheet-form button')
  await waitFor(evaluate, text('Member fixture comment'))
  await click('button[aria-label="Close comments"]')
  await click(sharePost)
  const shareUrl = new URL('/users/20?post=42#post-42', site).href
  assert.deepEqual(await evaluate('window.qa.shares'), [{ title: 'SNARP post', text: 'Public fixture post', url: shareUrl }])
  await evaluate('Object.defineProperty(navigator, "share", { value: undefined })')
  await click(sharePost)
  await waitFor(evaluate, text('Link copied'))
  assert.deepEqual(await evaluate('window.qa.copiedLinks'), [shareUrl])
  await fill('#post-body', 'Member fixture post')
  await delayResponse('post')
  await click('.composer button[type=submit]')
  await pending('post')
  assert.equal(await evaluate('document.querySelector("#post-body").disabled'), true)
  await release('post')
  await visible('#post-99')
  const memberCalls = await evaluate('window.qa.calls')
  assert.ok(memberCalls.some((call) => call.pathname.endsWith('/like') && call.method === 'PUT' && call.body.liked === true && call.bearer === 'Bearer fixture-member'))
  assert.ok(memberCalls.some((call) => call.pathname.endsWith('/comments') && call.method === 'POST' && call.body.body === 'Member fixture comment'))
  assert.equal(await evaluate('!!document.querySelector(".login-prompt")'), false)

  await evaluate('window.qa.memberExpired = true')
  await click('#post-42 button[title=Unlike]')
  await visible('.guest-shell #post-42')
  assert.equal(await evaluate('localStorage.getItem("token") || sessionStorage.getItem("token")'), null)
  await click('#post-42 button[title=Like]')
  await click('.login-prompt a[href^="/signup"]')
  await visible('#name')
  await fill('#name', 'Fixture Member')
  await typeLogin()
  await fill('#confirm', 'Orbit-Quartz-47!')
  await click('.auth-form button[type=submit]')
  await waitFor(evaluate, text('Check your email'))
  await go('/verify-email?token=fixture-token&retry=1')
  await waitFor(evaluate, text('Could not confirm your email'))
  await evaluate('window.qa.verificationUnavailable = false')
  await click('.auth-form button')
  await waitFor(evaluate, 'location.pathname + location.search + location.hash === "/feed?scope=everyone#post-42" && !!document.querySelector(".composer")')
  await go('/feed?scope=everyone#post-42')
  await visible('.composer')
  for (const [path, page] of [
    ['/reels', '.reels-page'],
    ['/citation-network', '.citation-hero'],
    ['/leaderboard', '.simple-leaderboard'],
    ['/researchers', '.rm-header'],
    ['/chat', '.pchat-layout'],
  ]) {
    await go(path)
    await visible(page)
  }

  async function typeLogin() {
    await fill('#email', 'fixture@example.test')
    await fill('#password', 'Orbit-Quartz-47!')
  }
}))
