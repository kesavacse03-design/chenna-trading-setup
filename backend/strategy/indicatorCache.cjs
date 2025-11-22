// Simple in-memory per-process indicator cache keyed by symbol+range+indicator+params
const crypto = require('crypto');
const cache = new Map();

function makeKey(symbol, from, to, interval, name, params){
  const p = params ? JSON.stringify(params) : '';
  const raw = `${symbol}|${from}|${to}|${interval}|${name}|${p}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

function get(symbol, from, to, interval, name, params){
  try { const k = makeKey(symbol, from, to, interval, name, params); return cache.get(k); } catch(_) { return undefined; }
}

function set(symbol, from, to, interval, name, params, value){
  try { const k = makeKey(symbol, from, to, interval, name, params); cache.set(k, value); } catch(_) {}
}

function clear(){ cache.clear(); }

module.exports = { get, set, clear };
