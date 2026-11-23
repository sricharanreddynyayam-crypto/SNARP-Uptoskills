import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rememberSignupReturn, takeSignupReturn } from './signup-return.js'

function mockStorage(t) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  })
}

test('email verification restores the matching signup route once', (t) => {
  mockStorage(t)
  rememberSignupReturn(' Reader@example.test ', '/feed?scope=everyone#post-42')
  assert.equal(takeSignupReturn('other@example.test'), '/')
  assert.equal(takeSignupReturn('reader@example.test'), '/feed?scope=everyone#post-42')
  assert.equal(takeSignupReturn('reader@example.test'), '/')
})

test('signup return rejects external destinations and expired requests', (t) => {
  mockStorage(t)
  const email = 'reader@example.test'
  assert.equal(takeSignupReturn(), '/')
  rememberSignupReturn(email, '//example.test/feed')
  assert.equal(takeSignupReturn(email), '/')

  t.mock.method(Date, 'now', () => 0)
  rememberSignupReturn(email, '/feed')
  t.mock.method(Date, 'now', () => 25 * 60 * 60 * 1000)
  assert.equal(takeSignupReturn(email), '/')
})
