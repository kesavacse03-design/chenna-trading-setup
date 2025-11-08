const { UpstoxAdapter: LegacyUpstox } = require('../../strategy/dataAdapter.cjs');

class UpstoxAdapter {
  constructor() { this.name = 'UPSTOX'; this.impl = new LegacyUpstox(); }
  getProviderName(){ return this.name; }
  async getHistorical(symbol, from, to, interval='day'){ return this.impl.fetch({ symbol, from, to, interval }); }
  async getTick(symbol){ return null; }
  async lookupInstrument(symbol){ return { symbol }; }
  subscribeTicks(symbol, cb) { return { unsubscribe:()=>{} }; }
}

module.exports = { UpstoxAdapter };
