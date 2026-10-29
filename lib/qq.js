/**
 * QQ 音乐渠道：管理 vendor/qq 里那个本地服务的生命周期。
 *
 * 那个项目是 Koa 服务，入口 dist/src/app.js；插件按「拉起子进程 → 等端口 → 转发请求」使用。
 * 免费歌匿名可取 128k；付费歌需要登录后才可能拿到（登录功能后置）。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import net from 'node:net'

const NODE_CMD = process.env.DSH_MUSIC_NODE || 'node'
const NODE_PKG = '@yakult-green-tea/qq-music-api'
const ENTRY = 'dist/src/app.js'
const require = createRequire(import.meta.url)

/** 优先本地 vendor 副本，其次根 node_modules 里的 npm 包。 */
function resolveRoot(vendorDir) {
  const local = join(vendorDir, 'node_modules', NODE_PKG)
  if (existsSync(join(local, ENTRY))) return local
  try {
    const dir = dirname(require.resolve(`${NODE_PKG}/package.json`))
    if (existsSync(join(dir, ENTRY))) return dir
  } catch { /* 没装 */ }
  return ''
}

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
        if (Date.now() > deadline) reject(new Error('QQ 音乐服务启动超时'))
        else setTimeout(tryOnce, 300)
      })
    }
    tryOnce()
  })
}

export function createQqService({ vendorDir, env = {} }) {
  let child = null
  let port = 0
  let startPromise = null

  function installed() {
    return !!resolveRoot(vendorDir)
  }

  async function start() {
    if (child && port) return port
    const root = resolveRoot(vendorDir)
    if (!root) throw new Error('QQ 音乐服务未安装：运行 npm i @yakult-green-tea/qq-music-api')
    port = await freePort()
    child = spawn(NODE_CMD, [join(root, ENTRY)], {
      cwd: root,
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

  async function request(path) {
    const p = await ensure()
    const res = await fetch(`http://127.0.0.1:${p}${path}`, {
      headers: { accept: 'application/json' },
    })
    return res.json()
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
