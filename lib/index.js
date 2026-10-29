/**
 * dsh-music-fetch host half
 *
 * 分享链接 → 歌曲 ID → 第三方项目取音频地址 → 下载到本地 → 交给 dsh-soundcheck。
 * 只做取流这一层：不写加密、不内置账号、不批量、不选音质、不存长期音频。
 * 详见 ../使用须知与合规说明.md。
 */
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createKugouService } from './kugou.js'
import { createQqService } from './qq.js'

export const name = 'dsh-music-fetch'

const require = createRequire(import.meta.url)
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))

const MAX_TOTAL_BYTES = 60 * 1024 * 1024
const MAX_BYTES = MAX_TOTAL_BYTES
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const SINGLE_HOSTS = /^(163cn\.tv|music\.163\.com|y\.music\.163\.com|m\.music\.163\.com)$/i

function resolvePaths(config) {
  const dataDir = config?.dataDir || process.env.DSH_MUSIC_FETCH_DIR || join(homedir(), '.dsh-music-fetch')
  return {
    dataDir,
    audioDir: join(dataDir, 'audio'),
    cookieFile: join(dataDir, 'cookie.txt'),
    kugouCookieFile: join(dataDir, 'kugou-cookie.txt'),
    vendorDir: join(PLUGIN_DIR, '..', 'vendor', 'kugou'),
    qqDir: join(PLUGIN_DIR, '..', 'vendor', 'qq'),
  }
}

function appErr(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

/**
 * 依赖失效时该告诉模型什么。
 *
 * 约定来自《使用须知与合规说明》「故障与维护」：只提示、不动手，带
 * 「症状 + 依赖版本 + 上游地址 + 建议动作」，并问要不要修。
 * 目的：别人的大肥鱼看到这句就能判断下一步，而不是只会复述「接口报错了」。
 */
const DEPENDS = {
  netease: {
    name: 'api-enhanced',
    pkg: '@neteasecloudmusicapienhanced/api',
    upstream: 'https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced',
    fix: 'npm i @neteasecloudmusicapienhanced/api@latest 后重启 DSH',
  },
  qq: {
    name: 'qq-music-api',
    pkg: '@yakult-green-tea/qq-music-api',
    upstream: 'https://github.com/yakult-green-tea/qq-music-api',
    fix: 'npm i @yakult-green-tea/qq-music-api@latest 后重启 DSH',
  },
  kugou: {
    name: 'KuGouMusicApi',
    pkg: '',
    upstream: 'https://github.com/MakcRe/KuGouMusicApi',
    fix: '重新克隆上游到 vendor/kugou 并 npm install；上游若已停更，这条渠道就走不通',
  },
}

function depVersionOf(pkg) {
  if (!pkg) return ''
  try {
    const pj = JSON.parse(readFileSync(join(PLUGIN_DIR, '..', 'package.json'), 'utf8'))
    return String(pj?.dependencies?.[pkg] || '').replace(/^[~^]/, '')
  } catch { return '' }
}

function depHint(kind) {
  const d = DEPENDS[kind]
  if (!d) return '要现在修吗？'
  const v = depVersionOf(d.pkg)
  return '当前依赖 ' + d.name + (v ? ' ' + v : '') + '，上游 ' + d.upstream
    + '；可试：' + d.fix + '。要现在修吗？'
}

/** 酷狗的设备 ID 要跨重启固定，否则登录 token 会跟着服务重启失效。 */
function kugouDeviceId(paths) {
  const f = join(paths.dataDir, 'kugou-guid.txt')
  try {
    const s = readFileSync(f, 'utf-8').trim()
    if (/^[0-9a-f]{32}$/i.test(s)) return s.toLowerCase()
  } catch { /* 还没生成过 */ }
  const g = randomBytes(16).toString('hex')
  try {
    mkdirSync(paths.dataDir, { recursive: true })
    writeFileSync(f, g, 'utf-8')
  } catch { /* 写不了就本次临时用 */ }
  return g
}

/** 首次调用时才初始化第三方项目需要的匿名凭据。 */
let initPromise = null
async function initApi() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const apiDir = dirname(require.resolve('@neteasecloudmusicapienhanced/api'))
    // 这个包在 require 时就会读系统临时目录里的匿名 token；文件不存在会直接抛错。
    const tokenFile = join(tmpdir(), 'anonymous_token')
    if (!existsSync(tokenFile)) writeFileSync(tokenFile, '', 'utf-8')
    const generateConfig = require(join(apiDir, 'generateConfig.js'))
    await generateConfig()
    return require(join(apiDir, 'main.js'))
  })()
  initPromise.catch(() => { initPromise = null })
  return initPromise
}

/* ───────────── 链接解析 ───────────── */

async function followShort(url) {
  let cur = url
  for (let i = 0; i < 5; i++) {
    const res = await fetch(cur, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA } })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) break
      cur = new URL(loc, cur).href
      continue
    }
    return cur
  }
  return cur
}

/** 只接受单曲；歌单/专辑/电台等直接拒绝。 */
async function parseNeteaseLink(input) {
  const text = String(input ?? '').trim()
  if (!text) throw appErr('LINK_INVALID', '没有收到链接。')

  const candidates = text.match(/https?:\/\/[^\s"'<>）)，。；;]+/gi) || []
  if (!candidates.length) {
    const bare = text.match(/\b(\d{6,12})\b/)
    if (bare) return { id: bare[1], source: 'id' }
    throw appErr('LINK_INVALID', '没从这段话里找到链接或歌曲 ID。')
  }

  let url = null
  for (const raw of candidates) {
    try {
      const u = new URL(raw)
      if (SINGLE_HOSTS.test(u.hostname)) { url = u; break }
    } catch { /* 不是合法 URL，跳过 */ }
  }
  if (!url) throw appErr('LINK_INVALID', '这不是网易云音乐的链接。')

  if (/^163cn\.tv$/i.test(url.hostname)) {
    url = new URL(await followShort(url.href))
  }

  const path = url.pathname
  if (/\/(playlist|album|djradio|artist|toplist|discover|search|user|program)\b/i.test(path)) {
    throw appErr('LINK_NOT_SINGLE', '这是歌单/专辑/电台之类的链接，不是单曲。请只发单曲分享。')
  }

  const idParam = url.searchParams.get('id')
  if (idParam && /\/song\b/i.test(path)) return { id: idParam, source: url.href }
  const m = path.match(/\/song\/(\d+)/i)
  if (m) return { id: m[1], source: url.href }

  throw appErr('LINK_NOT_SINGLE', '没认出单曲 ID。请用「分享 → 复制链接」里的单曲链接。')
}

const KUGOU_HOSTS = /(^|\.)kugou\.com$/i

/** 酷狗单曲：从 hash 参数或链接里提取 32 位 hash。 */
async function parseKugouLink(input) {
  const text = String(input ?? '').trim()
  const candidates = text.match(/https?:\/\/[^\s"'<>）)，。；;]+/gi) || []
  let url = null
  for (const raw of candidates) {
    try {
      const u = new URL(raw)
      if (KUGOU_HOSTS.test(u.hostname)) { url = u; break }
    } catch { /* 跳过非法 URL */ }
  }
  if (!url) throw appErr('LINK_INVALID', '这不是酷狗的链接。')

  // 短链（t1.kugou.com/xxx）和裸域名先跟随一次
  if (/^t\d*\.kugou\.com$/i.test(url.hostname) || url.pathname === '/') {
    url = new URL(await followShort(url.href))
  }

  const hashOf = (s) => {
    const m = String(s).match(/[0-9a-f]{32}/i)
    return m ? m[0].toLowerCase() : ''
  }
  const frag = new URLSearchParams(url.hash.replace(/^#/, ''))
  let hash = frag.get('hash') || url.searchParams.get('hash') || hashOf(url.pathname + url.search + url.hash)

  // mixsong / 分享页没有 hash 参数，hash 藏在页面内嵌数据里，抓一次页面
  if (!hash && (/\/mixsong\//i.test(url.pathname) || /\/share\/song\.html/i.test(url.pathname))) {
    try {
      const html = await fetch(url.href, { headers: { 'User-Agent': UA } }).then(r => r.text())
      const m = html.match(/"req_hash"\s*:\s*"([0-9a-f]{32})"/i)
        || html.match(/"hash"\s*:\s*"([0-9a-f]{32})"[^}]{0,300}"author_name"/i)
        || html.match(/"hash"\s*:\s*"([0-9a-f]{32})"/i)
      if (m) hash = m[1].toLowerCase()
    } catch { /* 抓不到就让下面统一报错 */ }
  }

  if (!hash) {
    throw appErr('LINK_NOT_SINGLE', '没从酷狗链接里认出歌曲 hash。请用「分享 → 复制链接」里的单曲链接。')
  }
  return { channel: 'kugou', hash, source: url.href }
}

/** QQ 音乐单曲：从 songDetail 路径、songmid 参数或分享短链里取 songmid。 */
const QQ_HOSTS = /(^|\.)qq\.com$/i

async function parseQqLink(input) {
  const text = String(input ?? '').trim()
  const candidates = text.match(/https?:\/\/[^\s"'<>）)，。；;]+/gi) || []
  let url = null
  for (const raw of candidates) {
    try {
      const u = new URL(raw)
      if (QQ_HOSTS.test(u.hostname)) { url = u; break }
    } catch { /* 跳过非法 URL */ }
  }
  if (!url) throw appErr('LINK_INVALID', '这不是 QQ 音乐的链接。')

  const midOf = (u) => {
    const byPath = u.pathname.match(/\/songDetail\/([0-9A-Za-z]{10,16})/i)
    if (byPath) return byPath[1]
    const byQuery = u.searchParams.get('songmid') || u.searchParams.get('mid') || ''
    if (/^[0-9A-Za-z]{10,16}$/.test(byQuery)) return byQuery
    return ''
  }

  let mid = midOf(url)
  // 分享短链（c6.y.qq.com/base/fcgi-bin/u?__=...）跟随一次
  if (!mid && /\/base\/fcgi-bin\/u/i.test(url.pathname)) {
    try {
      url = new URL(await followShort(url.href))
      mid = midOf(url)
    } catch { /* 跟随失败就下面统一报错 */ }
  }
  if (!mid) {
    throw appErr('LINK_NOT_SINGLE', '没从 QQ 音乐链接里认出歌曲 ID。请用「分享 → 复制链接」里的单曲链接。')
  }
  return { channel: 'qq', mid, source: url.href }
}

/** 按域名分发到对应渠道。 */
async function parseLink(input) {
  const text = String(input ?? '')
  if (/kugou\.com/i.test(text)) return parseKugouLink(text)
  if (/qq\.com/i.test(text) && /(songDetail|songmid|playsong)/i.test(text)) return parseQqLink(text)
  const target = await parseNeteaseLink(text)
  return { channel: 'netease', ...target }
}

/* ───────────── 取流与下载 ───────────── */

/** 下游分析插件是否装了；没装时返回文本要如实说「只有文件，没有分析」。 */
function soundcheckInstalled() {
  try {
    const base = join(homedir(), '.dsh', 'profiles')
    for (const name of readdirSync(base)) {
      if (existsSync(join(base, name, 'node_modules', 'dsh-soundcheck'))) return true
    }
  } catch { /* 目录不存在或读不了 */ }
  return false
}

function readCookie(paths) {
  try {
    return readFileSync(paths.cookieFile, 'utf-8').trim() || ''
  } catch {
    return ''
  }
}

function extFor(type, url) {
  const t = String(type || '').toLowerCase()
  if (t.includes('flac')) return '.flac'
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return '.m4a'
  if (t.includes('ogg')) return '.ogg'
  if (/\.(flac|m4a|ogg|wav)(\?|$)/i.test(url)) {
    const m = url.match(/\.(flac|m4a|ogg|wav)(\?|$)/i)
    return '.' + m[1].toLowerCase()
  }
  return '.mp3'
}

async function download(url, dest, referer = 'https://music.163.com/') {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: referer },
  })
  if (!res.ok) throw appErr('DOWNLOAD_FAILED', `下载失败（HTTP ${res.status}）。`)
  const type = String(res.headers.get('content-type') || '').toLowerCase()
  if (type.includes('text/html')) {
    throw appErr('DOWNLOAD_FAILED', '下载返回的是网页而不是音频，链接可能已经失效。')
  }
  const len = Number(res.headers.get('content-length') || 0)
  if (len > MAX_TOTAL_BYTES) {
    throw appErr('TOO_LARGE', `文件约 ${(len / 1024 / 1024).toFixed(1)} MB，超过总容量上限（60 MB）。`)
  }
  const chunks = []
  let total = 0
  for await (const chunk of res.body) {
    total += chunk.length
    if (total > MAX_TOTAL_BYTES) throw appErr('TOO_LARGE', '文件超过总容量上限（60 MB），已中止下载。')
    chunks.push(chunk)
  }
  writeFileSync(dest, Buffer.concat(chunks))
  return { bytes: total, type }
}

async function probeDuration(file) {
  try {
    const mm = await import('music-metadata')
    const meta = await mm.parseFile(file)
    return Number(meta?.format?.duration) || 0
  } catch {
    return 0
  }
}

function fmtDuration(sec) {
  if (!sec) return '未知'
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 每次取流前清掉一天前的缓存，避免临时目录越堆越大。 */
function cleanOld(audioDir) {
  try {
    const now = Date.now()
    for (const f of readdirSync(audioDir)) {
      const p = join(audioDir, f)
      try {
        if (now - statSync(p).mtimeMs > 24 * 3600 * 1000) unlinkSync(p)
      } catch { /* 单个文件删不掉不影响主流程 */ }
    }
  } catch { /* 目录不存在就先不管 */ }
}

/** 总容量超过 60 MB 时，从最旧的文件开始删，保留刚下载的那个。 */
function enforceQuota(audioDir, keepPath) {
  let files = []
  try {
    files = readdirSync(audioDir)
      .map(f => {
        const p = join(audioDir, f)
        try {
          const st = statSync(p)
          return { p, size: st.size, mtime: st.mtimeMs }
        } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => a.mtime - b.mtime)
  } catch { return 0 }
  let total = files.reduce((s, f) => s + f.size, 0)
  for (const f of files) {
    if (total <= MAX_TOTAL_BYTES) break
    if (f.p === keepPath) continue
    try { unlinkSync(f.p); total -= f.size } catch { /* 跳过删不掉的 */ }
  }
  return total
}

/* ───────────── 频率闸门 ───────────── */

const recentHits = []
function allowRequest() {
  const now = Date.now()
  while (recentHits.length && now - recentHits[0] > 60_000) recentHits.shift()
  if (recentHits.length >= 3) return false
  recentHits.push(now)
  return true
}

/* ───────────── 主流程 ───────────── */

let kugouService = null
let qqService = null

function readKugouCookie(paths) {
  try {
    return readFileSync(paths.kugouCookieFile, 'utf-8').trim() || ''
  } catch {
    return ''
  }
}

async function fetchAudio(paths, link) {
  if (!allowRequest()) {
    throw appErr('RATE_LIMIT', '请求太快了（60 秒内最多 3 次）。等一会儿再试。')
  }
  const target = await parseLink(link)
  if (target.channel === 'kugou') return fetchKugou(paths, target)
  if (target.channel === 'qq') return fetchQq(paths, target)
  return fetchNetease(paths, target)
}

async function fetchNetease(paths, target) {
  const { id } = target
  const api = await initApi()
  const cookie = readCookie(paths)

  let song = null
  try {
    const detail = await api.song_detail({ ids: id })
    song = detail?.body?.songs?.[0] || null
  } catch { /* 元数据拿不到不影响取流 */ }

  let data
  try {
    const r = await api.song_url_v1({ id, level: 'standard', ...(cookie ? { cookie } : {}) })
    const body = r?.body || {}
    if (body.code === 301 || body.code === 403) {
      throw appErr('LOGIN_REQUIRED', '接口要求登录。请把你的 cookie 填到插件数据目录的 cookie.txt 再试。')
    }
    data = (body.data || [])[0]
  } catch (e) {
    if (e?.code) throw e
    throw appErr('DEP_MAYBE_STALE', `取流接口报错：${e?.message ?? e}。如果最近一直这样，可能是依赖过期——${depHint('netease')}`)
  }

  if (!data || !data.url) {
    throw appErr('NO_URL', '拿不到音频地址（可能无版权、已下架，或需要登录）。')
  }

  mkdirSync(paths.audioDir, { recursive: true })
  cleanOld(paths.audioDir)

  const ext = extFor(data.type, data.url)
  const dest = join(paths.audioDir, `ne-${id}-${Date.now()}${ext}`)
  const { bytes } = await download(data.url, dest)
  enforceQuota(paths.audioDir, dest)

  const duration = await probeDuration(dest)
  const expected = song?.dt ? song.dt / 1000 : 0
  if (duration && expected && duration < expected * 0.7) {
    try { unlinkSync(dest) } catch { /* 删不掉也拦不住 */ }
    throw appErr(
      'TRIAL_ONLY',
      `拿到的是 ${fmtDuration(duration)} 的试听片段（整首约 ${fmtDuration(expected)}）。` +
      '不拿试听片段出分析报告。要分析整首，请在插件数据目录的 cookie.txt 里填自己的登录 cookie 后再试。',
    )
  }

  const title = song?.name ? `${song.name} - ${(song.ar || []).map(a => a.name).join(', ')}` : '（歌名未知）'
  const sizeMb = (bytes / 1024 / 1024).toFixed(1)
  const parts = [
    `已取到本地音频：${dest}`,
    `歌曲：${title}`,
    `时长：${fmtDuration(duration)}${expected ? `（整首 ${fmtDuration(expected)}）` : ''}，文件 ${sizeMb} MB`,
    soundcheckInstalled()
      ? `下一步：调用 audio_analyze，path="${dest}"`
      : '未检测到 dsh-soundcheck（音频分析插件）。文件已在本机，可自己播放；装好后再让我分析这首。',
  ]
  return { ok: true, text: parts.join('\n'), path: dest, id }
}

async function fetchQq(paths, target) {
  if (!qqService) throw appErr('CHANNEL_UNAVAILABLE', 'QQ 音乐渠道没有初始化。')

  let body
  try {
    body = await qqService.request(`/getMusicPlay?songmid=${encodeURIComponent(target.mid)}&quality=128`)
  } catch (e) {
    throw appErr('DEP_MAYBE_STALE', `QQ 音乐服务请求失败：${e?.message ?? e}。可能是依赖过期——${depHint('qq')}`)
  }

  const entry = body?.data?.playUrl?.[target.mid]
  if (!entry || !entry.url) {
    const hint = entry?.restriction?.hint?.message
      || '这首歌没有可用的播放地址（付费歌或区域限制；匿名只能取免费歌）。'
    throw appErr('NO_URL', `QQ 音乐：${hint}`)
  }

  mkdirSync(paths.audioDir, { recursive: true })
  cleanOld(paths.audioDir)

  const ext = extFor('', entry.url)
  const dest = join(paths.audioDir, `qq-${target.mid}-${Date.now()}${ext}`)
  const { bytes } = await download(entry.url, dest, 'https://y.qq.com/')
  enforceQuota(paths.audioDir, dest)

  const duration = await probeDuration(dest)
  const sizeMb = (bytes / 1024 / 1024).toFixed(1)
  const parts = [
    `已取到本地音频：${dest}`,
    `歌曲 ID：${target.mid}（QQ 音乐）`,
    `时长：${fmtDuration(duration)}，文件 ${sizeMb} MB`,
    soundcheckInstalled()
      ? `下一步：调用 audio_analyze，path="${dest}"`
      : '未检测到 dsh-soundcheck（音频分析插件）。文件已在本机，可自己播放；装好后再让我分析这首。',
  ]
  return { ok: true, text: parts.join('\n'), path: dest, id: target.mid }
}

async function fetchKugou(paths, target) {
  if (!kugouService) throw appErr('CHANNEL_UNAVAILABLE', '酷狗渠道没有初始化。')

  const cookie = readKugouCookie(paths)
  const qs = new URLSearchParams({ hash: target.hash })
  if (cookie) qs.set('cookie', cookie)

  let body
  try {
    const r = await kugouService.request(`/song/url?${qs.toString()}`)
    body = r?.body || r || {}
  } catch (e) {
    throw appErr('DEP_MAYBE_STALE', `酷狗接口调用失败：${e?.message ?? e}。如果最近一直这样，可能是上游接口变了——${depHint('kugou')}`)
  }

  const data = body.data || body
  const url = data?.url || data?.play_url || ''
  if (!url) {
    const msg = data?.error || data?.error_msg || body?.error || '拿不到音频地址'
    throw appErr('LOGIN_REQUIRED', `酷狗：${msg}。如果提示需要验证，请先在面板里扫码登录酷狗。`)
  }

  mkdirSync(paths.audioDir, { recursive: true })
  cleanOld(paths.audioDir)

  const ext = extFor(data.type || '', url)
  const dest = join(paths.audioDir, `kg-${target.hash.slice(0, 12)}-${Date.now()}${ext}`)
  const { bytes } = await download(url, dest)
  enforceQuota(paths.audioDir, dest)

  const duration = await probeDuration(dest)
  const expected = data.timelength ? Number(data.timelength) / 1000 : 0
  if (duration && expected && duration < expected * 0.7) {
    try { unlinkSync(dest) } catch { /* 删不掉也拦不住 */ }
    throw appErr('TRIAL_ONLY', `拿到的是 ${fmtDuration(duration)} 的片段（整首约 ${fmtDuration(expected)}），可能没有登录或没有权限。`)
  }

  const parts = [
    `已取到本地音频：${dest}`,
    `来源：酷狗（hash ${target.hash.slice(0, 12)}…）`,
    `时长：${fmtDuration(duration)}${expected ? `（整首 ${fmtDuration(expected)}）` : ''}，文件 ${(bytes / 1024 / 1024).toFixed(1)} MB`,
    soundcheckInstalled()
      ? `下一步：调用 audio_analyze，path="${dest}"`
      : '未检测到 dsh-soundcheck（音频分析插件）。文件已在本机，可自己播放；装好后再让我分析这首。',
  ]
  return { ok: true, text: parts.join('\n'), path: dest, hash: target.hash }
}

/* ───────────── 设置面板 ───────────── */

const PANEL_VERSION = '0.1.0'
let loginCache = { at: 0, value: null }

function depVersion() {
  try {
    const pkg = require(join(dirname(require.resolve('@neteasecloudmusicapienhanced/api')), 'package.json'))
    return pkg.version || 'unknown'
  } catch { return 'unknown' }
}

function sendJson(res, code, obj) {
  const buf = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': buf.length,
    'cache-control': 'no-store',
  })
  res.end(buf)
}

function readBody(req) {
  return new Promise(resolve => {
    let buf = ''
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    req.on('data', (c) => {
      buf += c
      if (buf.length > 1_000_000) { finish(''); try { req.destroy() } catch { /* 已断开 */ } }
    })
    req.on('end', () => finish(buf))
    req.on('error', () => finish(''))
  })
}

function listAudio(audioDir, page, pageSize) {
  let files = []
  try {
    files = readdirSync(audioDir)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const p = join(audioDir, f)
        const st = statSync(p)
        return { name: f, bytes: st.size, mtime: st.mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)
  } catch { /* 目录不存在就给空列表 */ }
  const total = files.length
  const start = (page - 1) * pageSize
  return { total, page, pageSize, items: files.slice(start, start + pageSize) }
}

async function verifyLogin(paths) {
  const cookie = readCookie(paths)
  if (!cookie) return { cookieSet: false, valid: false, nickname: null, uid: null }
  if (loginCache.value && Date.now() - loginCache.at < 60_000) return loginCache.value
  let value
  try {
    const api = await initApi()
    const r = await api.login_status({ cookie })
    const p = r?.body?.data?.profile || {}
    value = { cookieSet: true, valid: !!p.userId, nickname: p.nickname || null, uid: p.userId || null }
  } catch {
    value = { cookieSet: true, valid: false, nickname: null, uid: null }
  }
  loginCache = { at: Date.now(), value }
  return value
}

async function buildOverview(paths, page, pageSize) {
  const login = await verifyLogin(paths)
  const recent = listAudio(paths.audioDir, page, pageSize)
  let cacheBytes = 0
  try {
    for (const f of readdirSync(paths.audioDir)) {
      try { cacheBytes += statSync(join(paths.audioDir, f)).size } catch { /* 跳过 */ }
    }
  } catch { /* 目录不存在 */ }

  const neteaseDep = (() => {
    try { require.resolve('@neteasecloudmusicapienhanced/api/package.json'); return true } catch { return false }
  })()
  const environment = [
    { id: 'netease', label: '网易云解析库', ok: neteaseDep, hint: 'npm install' },
    { id: 'qq', label: 'QQ 音乐服务', ok: !!qqService?.installed(), hint: 'npm install' },
    { id: 'kugou', label: '酷狗服务', ok: !!kugouService?.installed(), hint: 'npm run setup:kugou' },
  ]

  const kgInstalled = !!kugouService?.installed()
  const kgCookie = !!readKugouCookie(paths)

  // QQ 的登录态由它自己的服务管，面板只读一下
  let qqLogin = { cookieSet: false, valid: false, nickname: null, uid: null }
  try {
    const st = await qqService?.request('/login/status')
    const d = st?.data || {}
    const ok = !!(d.loggedIn || d.uin || d.user?.uin)
    if (ok) {
      qqLogin = {
        cookieSet: true,
        valid: true,
        nickname: d.nickname || d.user?.nickname || null,
        uid: String(d.uin || d.user?.uin || ''),
      }
    }
  } catch { /* 服务没起 = 未登录 */ }

  return {
    pluginVersion: PANEL_VERSION,
    depVersion: depVersion(),
    dataDir: paths.dataDir,
    channels: [
      {
        id: 'netease',
        name: '网易云音乐',
        available: true,
        login,
        recent,
        cache: { count: recent.total, bytes: cacheBytes },
        limits: { perMinute: 3, maxBytes: MAX_BYTES },
      },
      {
        id: 'kugou',
        name: '酷狗音乐',
        available: kgInstalled,
        login: { cookieSet: kgCookie, valid: kgCookie, nickname: null, uid: null },
        service: { installed: kgInstalled, running: !!kugouService?.running },
        recent,
        cache: { count: recent.total, bytes: cacheBytes },
        limits: { perMinute: 3, maxBytes: MAX_BYTES },
      },
      {
        id: 'qq',
        name: 'QQ 音乐',
        available: true,
        login: qqLogin,
        service: { installed: !!qqService?.installed(), running: !!qqService?.running },
        anonymous: true,
        recent,
        cache: { count: recent.total, bytes: cacheBytes },
        limits: { perMinute: 3, maxBytes: MAX_BYTES },
      },
    ],
    environment,
    notice: '仅供个人学习、研究与音乐分析使用；只收单曲、固定基础音质、不批量。',
  }
}

function writeCookieFile(paths, cookie) {
  mkdirSync(paths.dataDir, { recursive: true })
  writeFileSync(paths.cookieFile, String(cookie).trim(), 'utf-8')
  loginCache = { at: 0, value: null }
}

function clearCookieFile(paths) {
  try { unlinkSync(paths.cookieFile) } catch { /* 本来就没有 */ }
  loginCache = { at: 0, value: null }
}

function registerPanelRoutes(ws, paths) {
  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/overview',
    handler: async (req, res) => {
      try {
        const u = new URL(req.url ?? '/', 'http://x')
        const page = Math.max(1, Number(u.searchParams.get('page') || 1) || 1)
        const pageSize = Math.min(50, Math.max(1, Number(u.searchParams.get('pageSize') || 8) || 8))
        sendJson(res, 200, { ok: true, data: await buildOverview(paths, page, pageSize) })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/login/qr',
    handler: async (req, res) => {
      try {
        const api = await initApi()
        const k = await api.login_qr_key({})
        const key = k?.body?.data?.unikey || k?.body?.unikey
        if (!key) throw new Error('没拿到二维码 key')
        const c = await api.login_qr_create({ key, qrimg: true })
        const d = c?.body?.data || {}
        sendJson(res, 200, { ok: true, data: { key, qrimg: d.qrimg || '', qrurl: d.qrurl || '' } })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/login/qr/check',
    handler: async (req, res) => {
      try {
        const u = new URL(req.url ?? '/', 'http://x')
        const key = u.searchParams.get('key') || ''
        if (!key) { sendJson(res, 400, { ok: false, error: '缺少 key' }); return }
        const api = await initApi()
        const r = await api.login_qr_check({ key })
        const b = r?.body || {}
        if (b.code === 803 && b.cookie) writeCookieFile(paths, b.cookie)
        sendJson(res, 200, { ok: true, data: { code: b.code, message: b.message || '', loggedIn: b.code === 803 } })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/login/cookie',
    handler: async (req, res) => {
      try {
        const raw = await readBody(req)
        let body = {}
        try { body = JSON.parse(raw || '{}') } catch { /* 空 body */ }
        const cookie = String(body.cookie || '').trim()
        if (!cookie) { sendJson(res, 400, { ok: false, error: 'cookie 为空' }); return }
        const api = await initApi()
        const r = await api.login_status({ cookie })
        const p = r?.body?.data?.profile || {}
        if (!p.userId) { sendJson(res, 200, { ok: false, error: 'cookie 无效或已过期' }); return }
        writeCookieFile(paths, cookie)
        sendJson(res, 200, { ok: true, data: { nickname: p.nickname || '', uid: p.userId } })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/logout',
    handler: (req, res) => {
      clearCookieFile(paths)
      sendJson(res, 200, { ok: true })
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/cache/clear',
    handler: (req, res) => {
      let removed = 0
      try {
        for (const f of readdirSync(paths.audioDir)) {
          try { unlinkSync(join(paths.audioDir, f)); removed++ } catch { /* 跳过 */ }
        }
      } catch { /* 目录不存在 */ }
      sendJson(res, 200, { ok: true, data: { removed } })
    },
  })

  // ── 酷狗：扫码登录（服务按需拉起） ──
  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/kugou/qr',
    handler: async (req, res) => {
      try {
        if (!kugouService) throw new Error('酷狗渠道没有初始化')
        const ts = Date.now()
        const k = await kugouService.request(`/login/qr/key?timestamp=${ts}`)
        const key = k?.body?.data?.qrcode || k?.data?.qrcode
        if (!key) throw new Error('没拿到酷狗二维码 key')
        const c = await kugouService.request(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=1&timestamp=${ts}`)
        const d = c?.body?.data || c?.data || {}
        sendJson(res, 200, { ok: true, data: { key, qrimg: d.base64 || '', qrurl: d.url || '' } })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/kugou/qr/check',
    handler: async (req, res) => {
      try {
        const u = new URL(req.url ?? '/', 'http://x')
        const key = u.searchParams.get('key') || ''
        if (!key) { sendJson(res, 400, { ok: false, error: '缺少 key' }); return }
        if (!kugouService) throw new Error('酷狗渠道没有初始化')
        const r = await kugouService.request(`/login/qr/check?key=${encodeURIComponent(key)}&timestamp=${Date.now()}`)
        const b = r?.body || r || {}
        const d = b.data || {}
        const status = Number(d.status)
        if (status === 4) {
          const cookie = Array.isArray(b.cookie) && b.cookie.length
            ? b.cookie.join('; ')
            : `token=${d.token || ''}; userid=${d.userid || ''}`
          mkdirSync(paths.dataDir, { recursive: true })
          writeFileSync(paths.kugouCookieFile, cookie, 'utf-8')
        }
        sendJson(res, 200, { ok: true, data: { status, loggedIn: status === 4 } })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/kugou/logout',
    handler: (req, res) => {
      try { unlinkSync(paths.kugouCookieFile) } catch { /* 本来就没有 */ }
      sendJson(res, 200, { ok: true })
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/qq/qr',
    handler: async (req, res) => {
      try {
        if (!qqService) throw new Error('QQ 渠道没有初始化')
        const k = await qqService.request('/login/qr/key?channel=qqmusic')
        const key = k?.data?.unikey || k?.data?.key || ''
        if (!key) throw new Error('拿不到二维码 key')
        const c = await qqService.request(`/login/qr/create?key=${encodeURIComponent(key)}`)
        sendJson(res, 200, { ok: true, data: { key, qrimg: c?.data?.qrimg || '' } })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/qq/qr/check',
    handler: async (req, res) => {
      try {
        const u = new URL(req.url ?? '/', 'http://x')
        const key = u.searchParams.get('key') || ''
        if (!key) { sendJson(res, 400, { ok: false, error: '缺少 key' }); return }
        if (!qqService) throw new Error('QQ 渠道没有初始化')
        const r = await qqService.request(`/login/qr/check?key=${encodeURIComponent(key)}`)
        const code = Number(r?.code || 0)
        sendJson(res, 200, { ok: true, data: { code, loggedIn: code === 803 } })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })

  ws.register({
    kind: 'exact',
    path: '/dsh-music-fetch/api/qq/logout',
    handler: async (req, res) => {
      try {
        if (qqService) await qqService.request('/logout')
        sendJson(res, 200, { ok: true })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) })
      }
    },
  })
}

/* ───────────── 工具注册 ───────────── */

const TOOL_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'text'],
    properties: {
      ok: { type: 'boolean', description: 'Whether fetching succeeded.' },
      text: { type: 'string', description: 'Local path and next step, or an error message.' },
    },
  },
  render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
}

const DESCRIPTION = [
  '把一条音乐单曲分享链接变成一台本机上的音频文件，交给 audio_analyze 分析。',
  '支持网易云、QQ 音乐（免费歌）；酷狗当前暂不可用。只接受单曲链接，歌单/专辑/电台会被拒绝。',
  '会员歌曲需要用户自己的凭据；没有凭据时只能拿到试听片段，本工具会拒绝返回。',
  '返回的文本里带绝对路径，照它调用 audio_analyze 即可。',
].join(' ')

export function apply(root, config) {
  const paths = resolvePaths(config)
  try { mkdirSync(paths.audioDir, { recursive: true }) } catch { /* 建不了让首次调用自己报 */ }

  kugouService = createKugouService({ vendorDir: paths.vendorDir, env: { KUGOU_API_GUID: kugouDeviceId(paths) } })
  try { process.once('exit', () => kugouService?.stop()) } catch { /* 注册不了就等服务自己退 */ }
  qqService = createQqService({ vendorDir: paths.qqDir })
  try { process.once('exit', () => qqService?.stop()) } catch { /* 同上 */ }

  // 临时排错日志：确认插件加载与工具注册到底走到哪一步（稳定后删掉）。
  const dbg = (msg, extra) => {
    try {
      mkdirSync(paths.dataDir, { recursive: true })
      appendFileSync(join(paths.dataDir, 'debug.log'), `${new Date().toISOString()} ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}\n`)
    } catch { /* 日志失败不影响主流程 */ }
  }
  dbg('apply:start', { dataDir: paths.dataDir, inject: typeof root?.inject })

  root.inject(['tools'], ctx => {
    dbg('tools:inject')
    try {
      const off = ctx.tools.register({
      name: 'music_fetch',
      description: DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          link: {
            type: 'string',
            description: '网易云音乐单曲分享链接，或分享文本（里面含链接）。也接受纯数字歌曲 ID。',
          },
        },
        required: ['link'],
      },
      execute: async (args) => {
        try {
          const r = await fetchAudio(paths, args?.link)
          return { ok: true, text: r.text }
        } catch (e) {
          const text = e?.code ? e.message : `取流失败：${e?.message ?? e}`
          return { ok: false, text }
        }
      },
      output: TOOL_OUTPUT,
      })
      dbg('tools:registered', { type: typeof off })
    } catch (e) {
      dbg('tools:register:error', { message: e?.message })
    }
  })

  // ── 设置面板：登录 / 渠道 / 最近记录 ──
  try {
    root.inject(['webServer'], ctx => {
      dbg('web:inject')
      const ws = ctx?.webServer
      if (!ws || typeof ws.register !== 'function') { dbg('web:no-service'); return }
      registerPanelRoutes(ws, paths)
      dbg('web:registered')
    })
  } catch {
    // 没有 webServer 服务的宿主：面板不出现，工具照常
  }
}
