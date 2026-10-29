/**
 * 酷狗渠道：管理 vendor/kugou 这个本地服务的生命周期。
 *
 * 那个项目只提供 HTTP 服务（Express），所以这里按「拉起子进程 → 等端口 → 转发请求」的方式用。
 * 服务只在第一次需要时启动；插件退出或服务自己退出后不再自动重启（下一次请求会重新拉起）。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import net from 'node:net'

const NODE_CMD = process.env.DSH_MUSIC_NODE || 'node'

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port
      srv.close(() => resolve(p))
    })
  })
}

function waitPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect({ port, host: '127.0.0.1' })
      sock.once('connect', () => { sock.destroy(); resolve() })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() > deadline) reject(new Error('酷狗服务启动超时'))
        else setTimeout(tryOnce, 300)
      })
    }
    tryOnce()
  })
}

/** 服务有时会在 JSON 前带一段标记，先截出 JSON 再解析。 */
function parseLoose(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error(`酷狗服务返回异常：${text.slice(0, 120)}`)
  return JSON.parse(text.slice(start, end + 1))
}

export function createKugouService({ vendorDir, env = {} }) {
  let child = null
  let port = 0
  let startPromise = null

  function installed() {
    try {
      return existsSync(join(vendorDir, 'index.js')) && existsSync(join(vendorDir, 'node_modules'))
    } catch {
      return false
    }
  }

  async function start() {
    if (child && port) return port
    if (!installed()) throw new Error('酷狗服务未安装：vendor/kugou 缺文件或依赖')
    port = await freePort()
    child = spawn(NODE_CMD, ['index.js'], {
      cwd: vendorDir,
      env: { ...process.env, PORT: String(port), ...env },
      windowsHide: true,
      stdio: 'ignore',
    })
    child.on('exit', () => { child = null; port = 0 })
    await waitPort(port)
    return port
  }

  function ensure() {
    if (child && port) return Promise.resolve(port)
    if (!startPromise) startPromise = start().finally(() => { startPromise = null })
    return startPromise
  }

  function stop() {
    if (child) {
      try { child.kill() } catch { /* 已经退出 */ }
      child = null
      port = 0
    }
  }

  async function request(path, { method = 'GET', body } = {}) {
    const p = await ensure()
    const res = await fetch(`http://127.0.0.1:${p}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    return parseLoose(await res.text())
  }

  return {
    ensure,
    stop,
    request,
    installed,
    get port() { return port },
    get running() { return !!child },
  }
}
