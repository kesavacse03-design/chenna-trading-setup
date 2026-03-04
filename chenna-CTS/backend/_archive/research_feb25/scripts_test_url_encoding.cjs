const url = new URL('https://api.upstox.com/v2/historical-candle/intraday/NSE_EQ%7CINE466L01038/1minute');
console.log('Original:', 'https://api.upstox.com/v2/historical-candle/intraday/NSE_EQ%7CINE466L01038/1minute');
console.log('Pathname:', url.pathname);
console.log('Contains pipe?', url.pathname.includes('|'));
console.log('Contains %7C?', url.pathname.includes('%7C'));
