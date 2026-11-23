import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const chromePath = process.env.CHROME_PATH ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome')

function connect(chrome) {
  const pending = new Map()
  let id = 0
  let buffer = ''
  chrome.stdio[4].setEncoding('utf8').on('data', (chunk) => {
    buffer += chunk
    let end
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      pending.get(message.id)?.(message)
    }
  })
  return (method, params, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id
    const timeout = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Chrome did not respond to ' + method))
    }, 6000)
    pending.set(requestId, (message) => {
      clearTimeout(timeout)
      pending.delete(requestId)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    })
    chrome.stdio[3].write(JSON.stringify({ id: requestId, method, params, sessionId }) + '\0')
  })
}

export async function waitFor(evaluate, expression) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await delay(50)
  }
  throw new Error('Browser condition timed out: ' + expression)
}

export async function withChrome(run) {
  const profile = await mkdtemp(join(tmpdir(), 'snarp-login-prompt-'))
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })

  try {
    await once(chrome, 'spawn')
    const send = connect(chrome)
    const { targetInfos } = await send('Target.getTargets')
    const target = targetInfos.find(({ type }) => type === 'page')
    const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    const input = (method, params) => send(method, params, sessionId)
    await input('Page.enable')
    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await input('Runtime.evaluate', { expression, returnByValue: true })
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
      return result.value
    }
    return await run({ input, evaluate })
  } finally {
    if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = once(chrome, 'exit')
      chrome.kill()
      await exited
    }
    await rm(profile, { recursive: true, force: true })
  }
}
