// With Vite running, use: node --test tests/login-prompt.native.mjs
// Override CHROME_PATH or SNARP_TEST_URL for a different browser binary or Vite address.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitFor, withChrome } from './chrome.mjs'

const fixtureUrl = new URL(process.env.SNARP_TEST_URL ?? 'http://localhost:5173/tests/login-prompt.html')

async function press(input, point, touch) {
  if (touch) await input('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  else await input('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
}

async function release(input, point, touch) {
  if (touch) await input('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  else await input('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}

test('LoginPrompt native browser regression', { timeout: 60000 }, (t) => withChrome(async ({ input, evaluate }) => {
  const nativeUrl = new URL(fixtureUrl)
  nativeUrl.searchParams.set('native', '')

  for (const { width, height, touch } of [{ width: 1280, height: 800, touch: false }, { width: 768, height: 1024, touch: true }, { width: 390, height: 844, touch: true }]) {
    const viewport = [width, height].join('×')
    await t.test(viewport + (touch ? ' touchscreen tap' : ' mouse click') + ' restores Like focus', async () => {
      await input('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch })
      await input('Emulation.setTouchEmulationEnabled', { enabled: touch })
      await input('Page.navigate', { url: nativeUrl.href })
      await waitFor(evaluate, 'document.querySelector("#results")?.dataset.status === "ready"')

      const route = await evaluate('document.querySelector("#location").textContent')
      const trigger = await evaluate('(() => { const r = document.querySelector("#trigger").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()')
      await press(input, trigger, touch)
      await release(input, trigger, touch)
      await waitFor(evaluate, '!!document.querySelector(".login-prompt [role=dialog]")')
      assert.equal(await evaluate('document.activeElement.textContent'), 'Log In')

      const backdrop = { x: 4, y: height - 4 }
      assert.equal(await evaluate('document.elementFromPoint(4, innerHeight - 4)?.matches(".login-prompt")'), true)
      await evaluate('document.addEventListener("pointerdown", (event) => { window.backdropInput = { trusted: event.isTrusted, type: event.pointerType }; }, { capture: true, once: true })')
      await press(input, backdrop, touch)
      assert.equal(await evaluate('!!document.querySelector(".login-prompt [role=dialog]")'), true, 'Backdrop press closed before release')
      await release(input, backdrop, touch)
      await waitFor(evaluate, '!document.querySelector(".login-prompt [role=dialog]")')

      assert.deepEqual(await evaluate('window.backdropInput'), { trusted: true, type: touch ? 'touch' : 'mouse' })
      assert.equal(await evaluate('document.querySelector("#location").textContent'), route)
      const focus = await evaluate('document.activeElement.id || document.activeElement.tagName')
      assert.equal(focus, 'trigger', 'Backdrop dismissal left focus on ' + focus)
    })

    await t.test(viewport + ' existing browser fixture passes', async () => {
      await input('Page.navigate', { url: fixtureUrl.href })
      await waitFor(evaluate, '["pass", "fail", "error"].includes(document.querySelector("#results")?.dataset.status)')
      const summary = await evaluate('document.querySelector("#results").textContent')
      assert.equal(await evaluate('document.querySelector("#results").dataset.status'), 'pass', summary)
      assert.equal(summary.split('\n').filter((line) => line.startsWith('PASS ')).length, 9)
    })
  }
}))
