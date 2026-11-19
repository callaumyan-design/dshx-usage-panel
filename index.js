// dshx-usage-panel — host half.
//
// Serves one JSON endpoint that the browser half renders in Settings:
//   GET /dshx-usage/snapshot
//
// It answers two questions:
//   * the DeepSeek account balance, read from the credentialed platform API;
//   * how many tokens this machine has spent today, folded from the session
//     logs through the harness's own session-query service.
//
// Nothing here reaches into ~/.dsh directly: credentials, session logs, and the
// child process that performs the HTTPS call all come from services.

/** Stable Cordis plugin name. */
export const name = 'dshx-usage-panel'

/** The webserver carrier must exist before routes can be registered. */
export const inject = ['webServer']

/** Route path of the snapshot endpoint. */
const ROUTE = '/dshx-usage/snapshot'

/** The balance endpoint is a network call; a page refresh must not hammer it. */
const BALANCE_TTL_MS = 120000

/** Upper bound on the extra scan for sessions created before today. */
const RESUME_SCAN_LIMIT = 40

/** Local midnight, evaluated once per process start. */
const DAY_START = (() => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
})()

function describeError(error) {
  if (error === null || error === undefined) return '未知错误'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string') return error.message
  return String(error)
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Fold every token this machine used since local midnight.
 * @param ctx - host context carrying the session-query service.
 */
async function readUsage(ctx) {
  const query = ctx.get('sessionQuery')
  if (query === undefined) return { available: false, reason: '会话查询服务不可用' }

  let sessions
  try {
    sessions = await query.listSessions()
  } catch (error) {
    return { available: false, reason: '读取会话列表失败：' + describeError(error) }
  }

  // Live sessions and sessions born today are certainly in scope.
  const known = []
  const maybe = []
  for (const record of sessions) {
    if (!record || !record.header) continue
    if (record.live === true || numberOr(record.header.createdAt, 0) >= DAY_START) known.push(record)
    else maybe.push(record)
  }

  // A session created before today can still have consumed tokens today, so
  // probe the newest remaining ones by time before reading any full log.
  const resumed = []
  for (const record of maybe.slice(0, RESUME_SCAN_LIMIT)) {
    try {
      const hits = await query.filterEvents(record.header.id, [
        { kind: 'time', from: DAY_START },
        { kind: 'type', values: ['assistant/message'] },
      ])
      if (Array.isArray(hits) && hits.length > 0) resumed.push(record)
    } catch {
      // An unreadable log simply contributes nothing.
    }
  }

  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, calls: 0 }
  let sessionsWithUsage = 0
  let readFailures = 0

  for (const record of known.concat(resumed)) {
    let snapshot
    try {
      snapshot = await query.readSession(record.header.id)
    } catch {
      readFailures += 1
      continue
    }
    let sessionCalls = 0
    for (const event of snapshot?.events ?? []) {
      if (!event || event.type !== 'assistant/message') continue
      if (numberOr(event.time, 0) < DAY_START) continue
      const usage = event.data?.usage
      if (!usage) continue
      totals.input += numberOr(usage.inputTokens, 0)
      totals.output += numberOr(usage.outputTokens, 0)
      totals.cacheRead += numberOr(usage.cacheReadTokens, 0)
      totals.cacheWrite += numberOr(usage.cacheWriteTokens, 0)
      totals.reasoning += numberOr(usage.reasoningTokens, 0)
      totals.calls += 1
      sessionCalls += 1
    }
    if (sessionCalls > 0) sessionsWithUsage += 1
  }

  return {
    available: true,
    since: DAY_START,
    input: totals.input,
    output: totals.output,
    cacheRead: totals.cacheRead,
    cacheWrite: totals.cacheWrite,
    reasoning: totals.reasoning,
    total: totals.input + totals.output,
    calls: totals.calls,
    sessionsWithUsage,
    considered: sessions.length,
    resumed: resumed.length,
    readFailures,
  }
}

/**
 * Read the account balance through the credentialed DeepSeek endpoint.
 * The key travels on curl's stdin, never in argv, so it cannot show up in `ps`.
 * @param ctx - host context carrying credentials and the subprocess service.
 */
async function fetchBalance(ctx) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return { available: false, reason: '凭据服务不可用' }

  let key
  try {
    const resolved = await credentials.resolve('DEEPSEEK_API_KEY')
    key = resolved?.value
  } catch (error) {
    return { available: false, reason: '读取 DEEPSEEK_API_KEY 失败：' + describeError(error) }
  }
  if (typeof key !== 'string' || key.length === 0) {
    return { available: false, reason: '未配置 DEEPSEEK_API_KEY' }
  }

  const subprocess = ctx.get('subprocess')
  if (subprocess === undefined) return { available: false, reason: '子进程服务不可用' }

  // curl ships with macOS and with Windows 10+; try PATH first, then the
  // platform's usual absolute locations.
  const fallbacks = process.platform === 'win32'
    ? ['curl.exe', 'curl', 'C:\\Windows\\System32\\curl.exe']
    : ['curl', '/usr/bin/curl', '/usr/local/bin/curl']
  let curl
  for (const candidate of fallbacks) {
    try {
      const resolved = await subprocess.resolveExecutable(candidate)
      if (typeof resolved === 'string' && resolved.length > 0) {
        curl = resolved
        break
      }
    } catch {
      // Try the next candidate.
    }
  }
  if (curl === undefined) return { available: false, reason: '没有找到 curl，无法查询余额' }

  let handle
  try {
    handle = subprocess.spawn({
      argv: [curl, '-sS', '--max-time', '20', '--config', '-'],
      // A directory that exists on every platform this client ships for.
      cwd: process.env.USERPROFILE || process.env.HOME || process.cwd(),
      stdio: {
        stdin: { data: 'url = "https://api.deepseek.com/user/balance"\nheader = "Authorization: Bearer ' + key + '"\n' },
        stdout: { maxBytes: 65536 },
        stderr: { maxBytes: 8192 },
      },
      graceMs: 5000,
    })
  } catch (error) {
    return { available: false, reason: '无法启动 curl：' + describeError(error) }
  }

  const outcome = await handle.done
  const stdout = handle.collected?.stdout?.readFrom(0)
  const stderr = handle.collected?.stderr?.readFrom(0)
  const text = typeof stdout?.text === 'string' ? stdout.text : ''
  const errorText = typeof stderr?.text === 'string' ? stderr.text.trim() : ''

  if (outcome.exitCode !== 0) {
    const detail = errorText ? '：' + errorText.slice(0, 200) : ''
    return { available: false, reason: `余额接口请求失败（curl 退出码 ${String(outcome.exitCode)}）${detail}` }
  }

  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return { available: false, reason: '余额接口返回了非 JSON 内容：' + text.slice(0, 200) }
  }

  const currencies = []
  for (const info of (Array.isArray(payload.balance_infos) ? payload.balance_infos : []).slice(0, 4)) {
    currencies.push({
      currency: typeof info.currency === 'string' ? info.currency : '',
      total: numberOr(Number(info.total_balance), null),
      granted: numberOr(Number(info.granted_balance), null),
      toppedUp: numberOr(Number(info.topped_up_balance), null),
    })
  }
  return { available: true, isAvailable: payload.is_available === true, currencies }
}

/**
 * Mount the snapshot endpoint.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  let balanceCache = null

  async function readBalance(force) {
    const now = Date.now()
    if (force !== true && balanceCache !== null && now - balanceCache.at < BALANCE_TTL_MS) {
      return balanceCache.value
    }
    const value = await fetchBalance(ctx)
    balanceCache = { at: now, value }
    return value
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      if ((req.method ?? 'GET') !== 'GET') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'method not allowed' }))
        return
      }
      let force = false
      try {
        force = new URL(req.url ?? ROUTE, 'http://127.0.0.1').searchParams.get('force') === '1'
      } catch {
        // A malformed query string simply does not force a refresh.
      }
      try {
        const balance = await readBalance(force)
        const usage = await readUsage(ctx)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ balance, usage, at: Date.now() }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: describeError(error) }))
      }
    },
  }), 'dshx-usage-route')
}
