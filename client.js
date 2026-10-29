/* dsh-music-fetch 设置页：登录 / 渠道 / 最近取流记录。 */
window.__ModuleLoader__.load({
  id: 'dsh-music-fetch',
  factory: (require) => {
    const React = require('react')
    const { useState, useEffect, useCallback } = React
    const h = React.createElement
    const NS = 'dsh-music-fetch'

    const zh = {
      nav: '音乐取流',
      title: 'dsh-music-fetch',
      subtitle: '把音乐分享链接变成本地音频，交给音频分析',
      channel: '渠道',
      netease: '网易云音乐',
      kugou: '酷狗音乐',
      kugouHint: '酷狗需要登录才能取流；服务按需启动，首次会慢几秒。',
      kugouBlocked: '上游取流接口被酷狗风控挡住（20028 本次请求需要验证），当前取不了流。骨架保留，等上游项目更新。',
      qq: 'QQ 音乐',
      soon: '未接入',
      unavailable: '暂不可用',
      qqHint: 'QQ 后续接入。',
      qqAnonHint: '匿名可拿免费歌（128k 整首）；付费/会员歌需要登录，登录暂未接入。',
      service: '服务',
      serviceRunning: '运行中',
      serviceIdle: '未启动',
      serviceMissing: '未安装',
      envTitle: '依赖',
      envMissing: '依赖不完整，对应渠道可能取流失败：',
      login: '登录',
      loggedIn: '已登录',
      notLoggedIn: '未配置登录',
      loggedOut: '未登录（只能取到试听片段）',
      nickname: '昵称',
      uid: 'UID',
      logout: '退出登录',
      qrLogin: '扫码登录',
      pasteCookie: '粘贴 cookie',
      qrHint: '用网易云 App 扫码，登录后 cookie 只存在本机。',
      qrHintKugou: '用酷狗 App 扫码，登录后 token 只存在本机。',
      qrWaiting: '等待扫码…',
      qrScanned: '已扫码，请在手机上确认',
      qrExpired: '二维码已过期，请刷新',
      qrDone: '登录成功',
      qrRefresh: '刷新二维码',
      cancel: '取消',
      cookiePlaceholder: '粘贴从浏览器里复制的一整段 cookie（不必粘贴全部，MUSIC_U 即可）',
      save: '保存并验证',
      saving: '验证中…',
      cookieOk: 'cookie 有效，已保存',
      cookieBad: 'cookie 无效或已过期',
      recent: '最近取流',
      empty: '还没有记录。把一条单曲分享链接发给模型，它会调用 music_fetch。',
      file: '文件',
      size: '大小',
      time: '时间',
      prev: '上一页',
      next: '下一页',
      pageInfo: '',
      page: '第',
      pageSuffix: '页',
      cache: '本地缓存',
      cacheFiles: '个文件',
      clear: '清理缓存',
      cleared: '已清理',
      files: '个文件',
      limits: '限制',
      limitText: '只收单曲 · 固定基础音质 · 每分钟最多 3 次 · 总容量 60 MB，超出自动删旧文件',
      dataDir: '数据目录',
      dep: '依赖',
      notice: '仅供个人学习、研究与音乐分析使用；不提供内容分发。',
      loading: '加载中…',
      error: '读取失败',
      retry: '重试',
      busy: '处理中…',
    }
    const en = {
      nav: 'Music Fetch',
      title: 'dsh-music-fetch',
      subtitle: 'Share link → local audio → analysis',
      channel: 'Channel',
      netease: 'NetEase Music',
      kugou: 'Kugou Music',
      kugouHint: 'Kugou requires login; its local service starts on demand.',
      kugouBlocked: 'Upstream fetch is currently blocked by Kugou verification (20028). Skeleton stays; waiting for the upstream project.',
      qq: 'QQ Music',
      soon: 'Not connected',
      unavailable: 'Unavailable',
      qqHint: 'QQ comes later.',
      qqAnonHint: 'Anonymous playback works for free songs (128k full track); paid/member songs need login, which is not wired yet.',
      service: 'Service',
      serviceRunning: 'running',
      serviceIdle: 'idle',
      serviceMissing: 'not installed',
      envTitle: 'Dependencies',
      envMissing: 'Missing dependencies; the related channel may fail:',
      login: 'Login',
      loggedIn: 'Signed in',
      notLoggedIn: 'Not signed in',
      loggedOut: 'Not signed in (trial clips only)',
      nickname: 'Nickname',
      uid: 'UID',
      logout: 'Sign out',
      qrLogin: 'QR login',
      pasteCookie: 'Paste cookie',
      qrHint: 'Scan with the NetEase app. The cookie stays on this machine.',
      qrHintKugou: 'Scan with the Kugou app. The token stays on this machine.',
      qrWaiting: 'Waiting for scan…',
      qrScanned: 'Scanned, confirm on your phone',
      qrExpired: 'QR expired, refresh',
      qrDone: 'Signed in',
      qrRefresh: 'Refresh QR',
      cancel: 'Cancel',
      cookiePlaceholder: 'Paste the cookie string copied from your browser',
      save: 'Save & verify',
      saving: 'Verifying…',
      cookieOk: 'Cookie valid, saved',
      cookieBad: 'Cookie invalid or expired',
      recent: 'Recent fetches',
      empty: 'No records yet. Send a single-song link to the model and it will call music_fetch.',
      file: 'File',
      size: 'Size',
      time: 'Time',
      prev: 'Prev',
      next: 'Next',
      pageInfo: '',
      page: 'Page',
      pageSuffix: '',
      cache: 'Local cache',
      cacheFiles: 'file(s)',
      clear: 'Clear cache',
      cleared: 'Removed',
      files: 'file(s)',
      limits: 'Limits',
      limitText: 'Single song only · standard quality · 3 per minute · 60 MB total, oldest files removed first',
      dataDir: 'Data dir',
      dep: 'Dependency',
      notice: 'For personal study, research and music analysis only; no content distribution.',
      loading: 'Loading…',
      error: 'Failed to load',
      retry: 'Retry',
      busy: 'Working…',
    }

    let t = (k) => k

    const S = {
      wrap: {
        padding: '4px 2px 12px',
        color: 'var(--dsw-alias-label-primary, #c9d1d9)',
        fontFamily: 'inherit',
        fontSize: '13px',
        lineHeight: '1.6',
      },
      head: { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' },
      title: { fontSize: '16px', fontWeight: 600, margin: 0 },
      sub: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #8b949e)' },
      card: {
        marginTop: '12px',
        border: '1px solid var(--dsw-alias-border-l1, #30363d)',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-1, #0d1117)',
        padding: '12px 14px',
      },
      cardTitle: { fontSize: '12px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary, #8b949e)', marginBottom: '8px' },
      tabs: { display: 'flex', gap: '6px', marginTop: '10px' },
      tab: (on) => ({
        padding: '5px 12px',
        borderRadius: '8px',
        fontSize: '12.5px',
        cursor: 'pointer',
        border: '1px solid ' + (on ? 'var(--dsw-alias-border-l2, #3d444d)' : 'transparent'),
        background: on ? 'var(--dsw-alias-bg-layer-3, #21262d)' : 'transparent',
        color: on ? 'var(--dsw-alias-label-primary, #c9d1d9)' : 'var(--dsw-alias-label-secondary, #8b949e)',
        fontWeight: on ? 600 : 400,
      }),
      row: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' },
      btn: (primary) => ({
        padding: '5px 12px',
        borderRadius: '8px',
        fontSize: '12.5px',
        cursor: 'pointer',
        border: '1px solid ' + (primary ? 'transparent' : 'var(--dsw-alias-border-l1, #30363d)'),
        background: primary ? 'var(--dsw-alias-button-primary-fill, #238636)' : 'var(--dsw-alias-bg-layer-2, #161b22)',
        color: primary ? 'var(--dsw-alias-label-primary-foreground, #fff)' : 'var(--dsw-alias-label-primary, #c9d1d9)',
      }),
      input: {
        width: '100%',
        minHeight: '54px',
        resize: 'vertical',
        padding: '7px 9px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1, #30363d)',
        background: 'var(--dsw-alias-bg-layer-2, #161b22)',
        color: 'var(--dsw-alias-label-primary, #c9d1d9)',
        fontSize: '12.5px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        boxSizing: 'border-box',
      },
      badge: (ok) => ({
        fontSize: '11px',
        padding: '1px 8px',
        borderRadius: '999px',
        border: '1px solid ' + (ok ? 'var(--dsw-alias-state-success-primary, #3fb950)' : 'var(--dsw-alias-border-l2, #3d444d)'),
        color: ok ? 'var(--dsw-alias-state-success-primary, #3fb950)' : 'var(--dsw-alias-label-tertiary, #6e7681)',
      }),
      muted: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, #6e7681)' },
      err: { fontSize: '12.5px', color: 'var(--dsw-alias-state-error-primary, #f85149)' },
      ok: { fontSize: '12.5px', color: 'var(--dsw-alias-state-success-primary, #3fb950)' },
      list: { marginTop: '6px' },
      item: {
        display: 'grid',
        gridTemplateColumns: '1fr 80px 150px',
        gap: '8px',
        padding: '6px 2px',
        borderTop: '1px solid var(--dsw-alias-border-l1, #30363d)',
        fontSize: '12.5px',
      },
      qr: { display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' },
      qrImg: { width: '148px', height: '148px', borderRadius: '8px', background: '#fff', padding: '4px' },
    }

    const fmtBytes = (n) => {
      if (!Number.isFinite(n) || n <= 0) return '0 B'
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1024 / 1024).toFixed(1) + ' MB'
    }
    const fmtTime = (ms) => {
      try {
        const d = new Date(ms)
        const p = (x) => String(x).padStart(2, '0')
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
      } catch { return '' }
    }

    function Panel() {
      const [state, setState] = useState({ status: 'loading', data: null, error: '' })
      const [tab, setTab] = useState('netease')
      const [page, setPage] = useState(1)
      const [qr, setQr] = useState(null) // { key, img, status }
      const [showCookie, setShowCookie] = useState(false)
      const [cookieInput, setCookieInput] = useState('')
      const [busy, setBusy] = useState('')
      const [msg, setMsg] = useState(null) // { ok, text }

      const load = useCallback(async (p = page) => {
        try {
          const r = await fetch(`/dsh-music-fetch/api/overview?page=${p}&pageSize=8`, {
            headers: { accept: 'application/json' }, cache: 'no-store',
          })
          const j = await r.json()
          if (!j?.ok) throw new Error(j?.error || 'HTTP ' + r.status)
          setState({ status: 'ok', data: j.data, error: '' })
        } catch (e) {
          setState({ status: 'error', data: null, error: String(e?.message || e) })
        }
      }, [page])

      useEffect(() => { load(1) }, []) // 首屏

      // 二维码轮询（网易云 / 酷狗状态码不同，这里统一映射）
      useEffect(() => {
        if (!qr?.key) return undefined
        const ch = qr.channel
        const base = ch === 'kugou' ? '/dsh-music-fetch/api/kugou/qr/check'
          : ch === 'qq' ? '/dsh-music-fetch/api/qq/qr/check'
            : '/dsh-music-fetch/api/login/qr/check'
        let stop = false
        const tick = async () => {
          try {
            const r = await fetch(`${base}?key=${encodeURIComponent(qr.key)}`, { cache: 'no-store' })
            const j = await r.json()
            if (stop || !j?.ok) return
            const d = j.data || {}
            const done = ch === 'kugou' ? d.status === 4 : ch === 'qq' ? d.code === 803 : d.loggedIn
            const expired = ch === 'kugou' ? d.status === 0 : d.code === 800
            const scanned = ch === 'kugou' ? d.status === 2 : d.code === 802
            if (done) {
              stop = true
              setQr(null)
              setMsg({ ok: true, text: t('qrDone') })
              await load(1)
            } else if (expired) {
              setQr((q) => (q ? { ...q, status: 'expired' } : q))
            } else if (scanned) {
              setQr((q) => (q ? { ...q, status: 'scanned' } : q))
            }
          } catch { /* 网络抖动，下一轮再试 */ }
        }
        const id = setInterval(tick, 2000)
        tick()
        return () => { stop = true; clearInterval(id) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [qr?.key])

      const post = useCallback(async (path, body) => {
        const r = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body || {}),
        })
        return r.json()
      }, [])

      const startQr = async () => {
        setBusy('qr')
        setMsg(null)
        try {
          const path = tab === 'kugou' ? '/dsh-music-fetch/api/kugou/qr'
            : tab === 'qq' ? '/dsh-music-fetch/api/qq/qr'
              : '/dsh-music-fetch/api/login/qr'
          const j = await post(path)
          if (!j?.ok) throw new Error(j?.error || '生成二维码失败')
          setQr({ key: j.data.key, img: j.data.qrimg, status: 'waiting', channel: tab })
        } catch (e) {
          setMsg({ ok: false, text: String(e?.message || e) })
        } finally { setBusy('') }
      }

      const saveCookie = async () => {
        if (!cookieInput.trim()) return
        setBusy('cookie')
        setMsg(null)
        try {
          const j = await post('/dsh-music-fetch/api/login/cookie', { cookie: cookieInput.trim() })
          if (j?.ok) {
            setMsg({ ok: true, text: t('cookieOk') + (j.data?.nickname ? `（${j.data.nickname}）` : '') })
            setCookieInput('')
            setShowCookie(false)
            await load(1)
          } else {
            setMsg({ ok: false, text: j?.error || t('cookieBad') })
          }
        } catch (e) {
          setMsg({ ok: false, text: String(e?.message || e) })
        } finally { setBusy('') }
      }

      const logout = async () => {
        setBusy('logout')
        try {
          await post(tab === 'kugou' ? '/dsh-music-fetch/api/kugou/logout'
            : tab === 'qq' ? '/dsh-music-fetch/api/qq/logout'
              : '/dsh-music-fetch/api/logout')
          setMsg(null)
          await load(1)
        } finally { setBusy('') }
      }

      const clearCache = async () => {
        setBusy('cache')
        try {
          const j = await post('/dsh-music-fetch/api/cache/clear')
          setMsg({ ok: true, text: `${t('cleared')} ${j?.data?.removed ?? 0} ${t('files')}` })
          await load(1)
        } catch (e) {
          setMsg({ ok: false, text: String(e?.message || e) })
        } finally { setBusy('') }
      }

      const goto = async (p) => {
        const max = Math.max(1, Math.ceil((state.data?.channels?.[0]?.recent?.total || 0) / 8))
        const np = Math.min(max, Math.max(1, p))
        setPage(np)
        await load(np)
      }

      const d = state.data
      const channel = d?.channels?.find((c) => c.id === tab) || d?.channels?.[0] || null
      const recent = channel?.recent || { total: 0, page: 1, pageSize: 8, items: [] }
      const pages = Math.max(1, Math.ceil(recent.total / recent.pageSize))

      return h('div', { style: S.wrap, 'data-dsh-plugin': 'dsh-music-fetch', 'data-dsh-surface': 'settings-modal' },
        h('div', { style: S.head },
          h('h3', { style: S.title }, t('title')),
          d ? h('span', { style: S.sub }, `v${d.pluginVersion} · ${t('dep')} api-enhanced ${d.depVersion}`) : null,
        ),
        h('div', { style: S.sub }, t('subtitle')),

        // 渠道切换
        h('div', { style: S.tabs },
          h('div', { style: S.tab(tab === 'netease'), onClick: () => { setTab('netease'); setQr(null); setMsg(null) } }, t('netease')),
          h('div', { style: S.tab(tab === 'qq'), onClick: () => { setTab('qq'); setQr(null); setMsg(null) } }, t('qq')),
          h('div', { style: S.tab(tab === 'kugou'), onClick: () => { setTab('kugou'); setQr(null); setMsg(null) } }, t('kugou') + ' · ' + t('unavailable')),
        ),

        d && Array.isArray(d.environment)
          ? h('div', { style: { ...S.card, borderColor: d.environment.some((e) => !e.ok) ? 'var(--dsw-alias-state-warn-primary, #d29922)' : undefined } },
            h('div', { style: S.muted },
              `${t('envTitle')}：` + d.environment.map((e) => `${e.label} ${e.ok ? '✓' : '✗'}`).join(' · ')),
            ...d.environment.filter((e) => !e.ok).map((e) =>
              h('div', { style: S.muted }, `${e.label} · ${e.hint}`)),
          )
          : null,

        state.status === 'loading' ? h('div', { style: { ...S.card, ...S.muted } }, t('loading'))
          : state.status === 'error' ? h('div', { style: S.card },
            h('div', { style: S.err }, t('error') + '：' + state.error),
            h('div', { style: S.row }, h('button', { style: S.btn(true), onClick: () => load(1) }, t('retry'))),
          )
          : h('div', null,
            tab === 'kugou' ? h('div', { style: { ...S.card, borderColor: 'var(--dsw-alias-state-warn-primary, #d29922)' } },
              h('div', { style: S.muted }, t('kugouBlocked'))) : null,
            tab === 'qq' ? h('div', { style: S.card }, h('div', { style: S.muted }, t('qqAnonHint'))) : null,
            // 登录卡
            h('div', { style: S.card },
              h('div', { style: S.cardTitle }, t('login') + ' · ' + (channel?.name || '')),
              h('div', { style: S.row },
                h('span', { style: S.badge(!!channel?.login?.valid) },
                  channel?.login?.valid ? t('loggedIn') : (channel?.login?.cookieSet ? t('cookieBad') : t('notLoggedIn'))),
                channel?.login?.valid && channel.login.nickname
                  ? h('span', null, `${t('nickname')}：${channel.login.nickname}`)
                  : null,
                channel?.login?.valid && channel.login.uid
                  ? h('span', { style: S.muted }, `${t('uid')}：${channel.login.uid}`)
                  : null,
                channel?.login?.valid
                  ? h('button', { style: S.btn(false), onClick: logout, disabled: busy === 'logout' }, t('logout'))
                  : null,
              ),
              tab === 'kugou' ? h('div', { style: S.muted },
                `${t('service')}：${channel?.service?.installed ? (channel.service.running ? t('serviceRunning') : t('serviceIdle')) : t('serviceMissing')}`) : null,
              !channel?.login?.valid ? h('div', { style: S.row },
                h('button', { style: S.btn(true), onClick: startQr, disabled: busy === 'qr' }, t('qrLogin')),
                tab === 'netease' ? h('button', { style: S.btn(false), onClick: () => { setShowCookie((v) => !v); setMsg(null) } }, t('pasteCookie')) : null,
              ) : null,
              qr ? h('div', { style: S.qr },
                h('img', { style: S.qrImg, src: qr.img, alt: 'QR' }),
                h('div', null,
                  h('div', { style: S.muted }, qr.channel === 'kugou' ? t('qrHintKugou') : t('qrHint')),
                  h('div', { style: qr.status === 'expired' ? S.err : S.ok },
                    qr.status === 'scanned' ? t('qrScanned')
                      : qr.status === 'expired' ? t('qrExpired')
                        : t('qrWaiting')),
                  h('div', { style: S.row },
                    h('button', { style: S.btn(false), onClick: startQr, disabled: busy === 'qr' }, t('qrRefresh')),
                    h('button', { style: S.btn(false), onClick: () => setQr(null) }, t('cancel')),
                  ),
                ),
              ) : null,
              tab === 'netease' && showCookie ? h('div', { style: { marginTop: '8px' } },
                h('textarea', {
                  style: S.input,
                  value: cookieInput,
                  placeholder: t('cookiePlaceholder'),
                  onChange: (e) => setCookieInput(e.target.value),
                }),
                h('div', { style: S.row },
                  h('button', { style: S.btn(true), onClick: saveCookie, disabled: busy === 'cookie' || !cookieInput.trim() },
                    busy === 'cookie' ? t('saving') : t('save')),
                  h('button', { style: S.btn(false), onClick: () => { setShowCookie(false); setCookieInput('') } }, t('cancel')),
                ),
              ) : null,
              msg ? h('div', { style: msg.ok ? S.ok : S.err, marginTop: '6px' }, msg.text) : null,
            ),

            // 最近取流
            h('div', { style: S.card },
              h('div', { style: S.cardTitle }, t('recent')),
              recent.items.length === 0
                ? h('div', { style: S.muted }, t('empty'))
                : h('div', { style: S.list },
                  recent.items.map((it) => h('div', { key: it.name, style: S.item },
                    h('span', { title: it.name, style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, it.name),
                    h('span', { style: S.muted }, fmtBytes(it.bytes)),
                    h('span', { style: S.muted }, fmtTime(it.mtime)),
                  )),
                ),
              recent.total > 0 ? h('div', { style: S.row },
                h('button', { style: S.btn(false), onClick: () => goto(page - 1), disabled: page <= 1 }, t('prev')),
                h('span', { style: S.muted }, `${t('page')} ${page} / ${pages} ${t('pageSuffix')}`),
                h('button', { style: S.btn(false), onClick: () => goto(page + 1), disabled: page >= pages }, t('next')),
              ) : null,
            ),

            // 缓存
            h('div', { style: S.card },
              h('div', { style: S.cardTitle }, t('cache')),
              h('div', { style: S.row },
                h('span', null, `${channel?.cache?.count ?? 0} ${t('cacheFiles')} · ${fmtBytes(channel?.cache?.bytes ?? 0)}`),
                h('button', { style: S.btn(false), onClick: clearCache, disabled: busy === 'cache' }, t('clear')),
              ),
            ),

            // 说明
            h('div', { style: { ...S.card, background: 'transparent' } },
              h('div', { style: S.cardTitle }, t('limits')),
              h('div', { style: S.muted }, t('limitText')),
              h('div', { style: { ...S.muted, marginTop: '6px' } }, `${t('dataDir')}：${d?.dataDir || ''}`),
              h('div', { style: { ...S.muted, marginTop: '6px' } }, t('notice')),
            ),
          ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-music-fetch: dicts')
          const bound = ctx.locale.bind(NS)
          t = bound
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'dsh-music-fetch',
            order: 71,
            label: () => bound('nav'),
            locale: NS,
          }, Panel))
        } catch (e) {
          console.error('[dsh-music-fetch] apply failed:', e)
        }
      },
    }
  },
})
