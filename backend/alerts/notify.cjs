const https = require('https');
const url = require('url');

function postJson(u, payload){
  return new Promise((resolve,reject)=>{
    try {
      const p = url.parse(u);
      const body = JSON.stringify(payload);
      const opts = { hostname: p.hostname, port: p.port || 443, path: p.path, method: 'POST', headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) } };
      const req = https.request(opts, (res)=>{
        let d=''; res.on('data',c=>d+=c); res.on('end',()=> resolve({ statusCode: res.statusCode, body: d }));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    } catch(e){ reject(e); }
  });
}

async function sendSlack(webhookUrl, text){
  if (!webhookUrl) throw new Error('no webhook');
  return postJson(webhookUrl, { text });
}

async function sendTelegram(botToken, chatId, text){
  if (!botToken || !chatId) throw new Error('missing telegram config');
  const path = `/bot${botToken}/sendMessage`;
  const payload = { chat_id: chatId, text };
  const u = `https://api.telegram.org${path}`;
  return postJson(u, payload);
}

async function sendAlert(text){
  const slack = process.env.SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK;
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  const results = [];
  if (slack) {
    try { const r = await sendSlack(slack, text); results.push({ slack: r.statusCode }); } catch(e){ results.push({ slackError: String(e.message||e) }); }
  }
  if (tgToken && tgChat) {
    try { const r = await sendTelegram(tgToken, tgChat, text); results.push({ telegram: r.statusCode }); } catch(e){ results.push({ telegramError: String(e.message||e) }); }
  }
  return results;
}

module.exports = { sendAlert };
