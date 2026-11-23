import assert from 'node:assert/strict'
import { test } from 'node:test'
import { api, getToken, saveToken } from './api.js'

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

function browser(t) {
  const events = []
  const globals = {
    localStorage: storage(),
    sessionStorage: storage(),
    window: { location: { pathname: '/feed' }, dispatchEvent: (event) => events.push(event.type) },
  }
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous)
      else delete globalThis[name]
    })
  }
  return events
}

test('a new session replaces a token stored in the other remember mode', (t) => {
  browser(t)
  saveToken('remembered', true)
  saveToken('temporary', false)
  assert.equal(getToken(), 'temporary')
  assert.equal(localStorage.getItem('token'), null)
  saveToken('new-remembered', true)
  assert.equal(getToken(), 'new-remembered')
  assert.equal(sessionStorage.getItem('token'), null)
})

test('anonymous feed reads omit a stored bearer and forward their cancellation signal', async (t) => {
  browser(t)
  saveToken('remembered', true)
  const controller = new AbortController()
  const request = t.mock.method(globalThis, 'fetch', async () => Response.json({ items: [], page: 1, hasMore: false }))
  await api('/posts?page=1&scope=everyone', { authenticated: false, signal: controller.signal })
  const [, options] = request.mock.calls[0].arguments
  assert.equal(options.headers.Authorization, undefined)
  assert.equal(options.signal, controller.signal)
})

test('late blocked responses from an earlier session cannot sign out the new user', async (t) => {
  const events = browser(t)
  saveToken('old', true)
  let complete
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { complete = resolve }))
  const request = api('/posts')
  saveToken('new', false)
  complete(Response.json({ error: 'Blocked', code: 'account_blocked' }, { status: 403 }))
  await assert.rejects(request, { status: 403 })
  assert.equal(getToken(), 'new')
  assert.deepEqual(events, [])
})
