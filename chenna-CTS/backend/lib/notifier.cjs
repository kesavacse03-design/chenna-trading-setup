const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')

const STATE_FILE = path.join(__dirname, '..', 'tmp', 'notifier_state.json')

function safeReadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8')
    const s = JSON.parse(raw)
    return { lastReminderAt: 0, lastExpiredAt: 0, ...s }
  } catch (e) {
    return { lastReminderAt: 0, lastExpiredAt: 0 }
  }
}

function safeWriteState(s) {
  try {
    const dir = path.dirname(STATE_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify(s))
  } catch (e) {
    console.error('[notifier] failed to write state', e.message)
  }
}

async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) {
    console.log('[notifier] telegram tokens not configured; skipping send')
    return { ok: false, reason: 'not-configured' }
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    })
    const json = await res.json()
    return json
  } catch (err) {
    console.error('[notifier] telegram send failed', err.message)
    return { ok: false, reason: err.message }
  }
}

module.exports = function createNotifier(opts) {
  // opts: { readTokens: fn -> { expiresAt }, getDiag: fn -> diag, sendLog: fn }
  const {
    readTokens,
    getDiag,
    sendLog = (m) => console.log('[notifier]', m),
    env = process.env
  } = opts

  const leadMins = Number(env.REMINDER_LEAD_MINUTES || 60)
  const intervalMinutes = Number(env.NOTIFIER_POLL_MINUTES || 5)
  const botToken = env.TELEGRAM_BOT_TOKEN
  const chatId = env.TELEGRAM_CHAT_ID

  let timer = null
  let state = safeReadState()

  function shouldSendReminder(expiresAt) {
    if (!expiresAt) return false
    const now = Date.now()
    const leadMs = leadMins * 60 * 1000
    const due = (expiresAt - now) <= leadMs
    const alreadySent = (state.lastReminderAt || 0) > now - (24 * 60 * 60 * 1000) // once per day
    return due && !alreadySent
  }

  async function doReminder(reason) {
    const diag = getDiag ? getDiag() : { token: readTokens && readTokens() }
    const expiresAt = diag && diag.token && diag.token.expiresAt
    const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 60000)) : null
    const msg = `Reminder: Upstox access token will expire in ${remaining} minutes. Please re-authenticate using the dashboard or mobile.\n\nOpen: http://localhost:3001/auth/upstox/url?offline=1`
    sendLog(`sending reminder (${reason}) remaining=${remaining}mins`)
    const r = await sendTelegramMessage(botToken, chatId, msg)
    if (r && r.ok) {
      state.lastReminderAt = Date.now()
      safeWriteState(state)
      sendLog('telegram send ok')
      return true
    } else {
      sendLog('telegram send failed: ' + JSON.stringify(r))
      return false
    }
  }

  async function doExpiredReminder(reason) {
    const diag = getDiag ? getDiag() : { token: readTokens && readTokens() }
    const expiresAt = diag && diag.token && diag.token.expiresAt
    let minsAgo = null
    if (expiresAt) minsAgo = Math.max(0, Math.floor((Date.now() - expiresAt) / 60000))
    const msg = `Alert: Upstox access token has expired${minsAgo !== null ? ` ${minsAgo} minutes ago` : ''}. Please re-authenticate now.\n\nOpen: http://localhost:3001/auth/upstox/url?offline=1`
    sendLog(`sending EXPIRED reminder (${reason}) minsAgo=${minsAgo}`)
    const r = await sendTelegramMessage(botToken, chatId, msg)
    if (r && r.ok) {
      state.lastExpiredAt = expiresAt || Date.now()
      safeWriteState(state)
      sendLog('telegram expired send ok')
      return true
    } else {
      sendLog('telegram expired send failed: ' + JSON.stringify(r))
      return false
    }
  }

  async function checkAndRemind() {
    try {
      const diag = getDiag ? getDiag() : null
      const expiresAt = diag && diag.token && diag.token.expiresAt
      const now = Date.now()
      // pre-expiry reminder
      if (shouldSendReminder(expiresAt)) {
        await doReminder('scheduled')
      }
      // post-expiry one-time alert (per expiry event)
      if (expiresAt && now > expiresAt) {
        const alreadyNotifiedThisExpiry = state.lastExpiredAt && Math.abs(state.lastExpiredAt - expiresAt) < (5 * 60 * 1000)
        if (!alreadyNotifiedThisExpiry) {
          await doExpiredReminder('scheduled-expired')
        }
      }
    } catch (e) {
      sendLog('checkAndRemind error: ' + e.message)
    }
  }

  return {
    start() {
      if (timer) return
      sendLog(`notifier started: leadMins=${leadMins} interval=${intervalMinutes}min`) 
      // run immediately then schedule
      checkAndRemind()
      timer = setInterval(checkAndRemind, intervalMinutes * 60 * 1000)
    },
    stop() {
      if (timer) clearInterval(timer); timer = null
    },
    async triggerNow() {
      return await doReminder('manual')
    },
    async triggerExpiredNow() {
      return await doExpiredReminder('manual')
    },
    getState() { return state }
  }
}
