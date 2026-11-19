// dshx-usage-panel — browser half.
//
// A durable DSH client module: the harness composes it into the page bundle
// because this package declares `dsh.client` and is loaded as a host row. It
// contributes one Settings page and reads its data from the host half's
// `/dshx-usage/snapshot` endpoint.
window.__ModuleLoader__.load({
  id: 'dshx-usage-panel',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    // Translucent neutrals read correctly in both the light and dark themes
    // without binding this panel to theme tokens it does not own.
    const card = {
      border: '1px solid rgba(127,127,127,0.22)',
      borderRadius: 10,
      padding: '14px 16px',
      background: 'rgba(127,127,127,0.07)',
    }
    const cardTitle = {
      fontSize: 11,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      opacity: 0.55,
      marginBottom: 10,
    }
    const note = { marginTop: 8, fontSize: 11.5, opacity: 0.6, lineHeight: 1.6 }
    const muted = { fontSize: 12, opacity: 0.65 }
    const errorText = { fontSize: 12, color: '#d9534f', lineHeight: 1.6 }
    const metric = {
      border: '1px solid rgba(127,127,127,0.18)',
      borderRadius: 8,
      padding: '10px 12px',
    }
    const metricLabel = { fontSize: 11, opacity: 0.6 }
    const metricValue = {
      marginTop: 4,
      fontSize: 16,
      fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
    }
    const metricHint = { marginTop: 2, fontSize: 10.5, opacity: 0.5 }
    const button = {
      border: '1px solid rgba(127,127,127,0.35)',
      background: 'transparent',
      color: 'inherit',
      borderRadius: 6,
      padding: '5px 12px',
      fontSize: 12,
      cursor: 'pointer',
    }
    const badge = {
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: 99,
      fontSize: 11,
      border: '1px solid rgba(127,127,127,0.35)',
    }
    const grid = {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
      gap: 10,
    }

    function pad2(value) {
      return value < 10 ? '0' + String(value) : String(value)
    }

    function clock(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—'
      const date = new Date(ms)
      return pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds())
    }

    function compact(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(2) + 'M'
      if (Math.abs(value) >= 10000) return (value / 1000).toFixed(1) + 'K'
      return String(value)
    }

    function exact(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return String(value)
    }

    function money(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return value.toFixed(2)
    }

    function Metric(props) {
      return React.createElement('div', { style: metric },
        React.createElement('div', { style: metricLabel }, props.label),
        React.createElement('div', { style: metricValue }, props.value),
        props.hint ? React.createElement('div', { style: metricHint }, props.hint) : null)
    }

    function BalanceCard(props) {
      const balance = props.balance
      if (!balance) {
        return React.createElement('div', { style: card },
          React.createElement('div', { style: cardTitle }, '账户余额'),
          React.createElement('div', { style: muted }, '读取中…'))
      }
      if (balance.available !== true) {
        return React.createElement('div', { style: card },
          React.createElement('div', { style: cardTitle }, '账户余额'),
          React.createElement('div', { style: errorText }, String(balance.reason || '余额不可用')),
          React.createElement('div', { style: note },
            '余额通过 DEEPSEEK_API_KEY 调用 api.deepseek.com/user/balance 获取；可在「设置 → 模型」中配置或更新该密钥。'))
      }
      const currencies = Array.isArray(balance.currencies) ? balance.currencies : []
      const primary = currencies.length > 0 ? currencies[0] : undefined
      const children = [
        React.createElement('div', { style: cardTitle, key: 'title' }, '账户余额'),
        React.createElement('div', {
          key: 'main',
          style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
        },
          React.createElement('div', {
            style: { fontSize: 30, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 },
          }, primary ? money(primary.total) : '—'),
          React.createElement('div', { style: { fontSize: 13, opacity: 0.7 } },
            primary && primary.currency ? primary.currency : ''),
          React.createElement('span', {
            key: 'badge',
            style: balance.isAvailable === true
              ? Object.assign({}, badge, { color: '#2ea043', borderColor: 'rgba(46,160,67,0.5)' })
              : Object.assign({}, badge, { color: '#d29922', borderColor: 'rgba(210,153,34,0.5)' }),
          }, balance.isAvailable === true ? '可用' : '余额不足')),
      ]
      if (primary) {
        children.push(React.createElement('div', { style: note, key: 'split' },
          '赠送 ' + money(primary.granted) + '  ·  充值 ' + money(primary.toppedUp)))
      }
      if (currencies.length > 1) {
        children.push(React.createElement('div', { style: note, key: 'more' },
          currencies.slice(1).map((item) => (item.currency || '') + ' ' + money(item.total)).join('  ·  ')))
      }
      return React.createElement('div', { style: card }, children)
    }

    function UsageCard(props) {
      const usage = props.usage
      if (!usage) {
        return React.createElement('div', { style: card },
          React.createElement('div', { style: cardTitle }, '今日 Token 用量'),
          React.createElement('div', { style: muted }, '统计中…'))
      }
      if (usage.available !== true) {
        return React.createElement('div', { style: card },
          React.createElement('div', { style: cardTitle }, '今日 Token 用量'),
          React.createElement('div', { style: errorText }, String(usage.reason || '用量不可用')))
      }
      const metrics = [
        { label: '总计', value: compact(usage.total), hint: exact(usage.total) + ' tokens' },
        { label: '输入', value: compact(usage.input), hint: exact(usage.input) },
        { label: '输出', value: compact(usage.output), hint: exact(usage.output) },
        { label: '缓存命中', value: compact(usage.cacheRead), hint: 'cache read' },
        { label: '缓存写入', value: compact(usage.cacheWrite), hint: 'cache write' },
        { label: '推理', value: compact(usage.reasoning), hint: 'reasoning' },
        { label: '模型调用', value: exact(usage.calls), hint: '次' },
        { label: '涉及会话', value: exact(usage.sessionsWithUsage), hint: '个' },
      ]
      const notes = ['统计范围：今日 00:00 起发生模型调用的会话，共检查 ' + exact(usage.considered) + ' 个。']
      if (typeof usage.resumed === 'number' && usage.resumed > 0) {
        notes.push('其中 ' + String(usage.resumed) + ' 个是跨天继续使用的旧会话。')
      }
      if (typeof usage.readFailures === 'number' && usage.readFailures > 0) {
        notes.push('有 ' + String(usage.readFailures) + ' 个会话日志读取失败，未计入。')
      }
      return React.createElement('div', { style: card },
        React.createElement('div', { style: cardTitle }, '今日 Token 用量'),
        React.createElement('div', { style: grid }, metrics.map((item) => React.createElement(Metric, {
          key: item.label,
          label: item.label,
          value: item.value,
          hint: item.hint,
        }))),
        React.createElement('div', { style: note }, notes.join(' ')))
    }

    function UsageSection() {
      const [state, setState] = React.useState({ phase: 'loading' })
      const [request, setRequest] = React.useState({ nonce: 0, force: false })

      React.useEffect(() => {
        let alive = true
        function load(force) {
          setState((previous) => ({
            phase: previous.data ? 'refreshing' : 'loading',
            data: previous.data,
            error: previous.error,
          }))
          fetch('/dshx-usage/snapshot' + (force ? '?force=1' : ''), { credentials: 'same-origin' })
            .then((response) => {
              if (!response.ok) throw new Error('HTTP ' + String(response.status))
              return response.json()
            })
            .then((data) => {
              if (!alive) return
              setState({ phase: 'ready', data })
            })
            .catch((error) => {
              if (!alive) return
              setState({ phase: 'error', error: error && error.message ? error.message : String(error) })
            })
        }
        load(request.force)
        const timer = setInterval(() => load(false), 60000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [request])

      const data = state.data
      const busy = state.phase === 'loading' || state.phase === 'refreshing'
      return React.createElement('div', {
        style: { padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14, color: 'inherit' },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
        },
          React.createElement('div', null,
            React.createElement('h2', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, '用量与余额'),
            React.createElement('div', { style: { marginTop: 4, fontSize: 12, opacity: 0.6 } },
              busy ? '正在刷新…' : '更新于 ' + clock(data ? data.at : undefined) + ' · 每分钟自动刷新')),
          React.createElement('button', {
            style: busy ? Object.assign({}, button, { opacity: 0.45, cursor: 'default' }) : button,
            disabled: busy,
            onClick: () => setRequest({ nonce: request.nonce + 1, force: true }),
          }, busy ? '刷新中' : '刷新')),
        state.phase === 'error'
          ? React.createElement('div', { style: card },
              React.createElement('div', { style: errorText }, '读取失败：' + String(state.error || '')))
          : null,
        React.createElement(BalanceCard, { balance: data ? data.balance : undefined }),
        React.createElement(UsageCard, { usage: data ? data.usage : undefined }),
        React.createElement('div', { style: { fontSize: 11, opacity: 0.45 } },
          'dshx-usage-panel v1.0.0 · 持久化插件（随客户端分发）'))
    }

    /** Client services this plugin reads. */
    const inject = ['slots']

    /**
     * Register the Settings page once its slot declaration is on the ledger.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dshx-usage',
        order: 30,
        label: '用量与余额',
      }, UsageSection))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
