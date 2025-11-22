const http = require('http');
const fs = require('fs');
const path = require('path');
const STOCKS_FILE = path.join(__dirname,'..','cts_stocks.json');
function readStocks(){ try{ return JSON.parse(fs.readFileSync(STOCKS_FILE,'utf8')||'[]'); }catch(e){ return []; } }
function writeStocks(list){ fs.writeFileSync(STOCKS_FILE, JSON.stringify(list,null,2),'utf8'); }
function sendJSON(res,status,obj){ res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(obj)); }
const server = http.createServer((req,res)=>{
  if(req.method==='GET' && req.url==='/api/stocks'){
    const list = readStocks();
    const out = (list || []).map(it => ({
      id: it.id || null,
      stockName: it.stockName || it.symbol || null,
      date: it.date || null,
      category: it.category || it.categoryRaw || null,
      categoryRaw: it.categoryRaw || it.category || null,
      categoryKey: it.categoryKey || it.category || null,
      price: typeof it.price === 'number' ? it.price : null,
      addedDate: it.addedDate || null,
      expires_at: it.expires_at || null,
      instrument_token: it.instrument_token || it.instrument_key || null,
    }));
    return sendJSON(res,200,out);
  }
  if(req.method==='POST' && req.url==='/api/stocks'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      try{ const item = JSON.parse(body||'{}'); const list = readStocks();
          const symbol = item.symbol || item.stockName || null;
          const date = item.date || null;
          const catKey = item.categoryKey || item.category || item.categoryRaw || null;
          const dup = list.find(x=> (x.stockName===symbol || x.symbol===symbol) && x.date===date && ((x.categoryKey||x.category||x.categoryRaw) === catKey));
          if(dup) return sendJSON(res,409,{ok:false,error:'DUPLICATE'});
          const id = Date.now();
          const created = { id, stockName: symbol, date, category: item.category || item.categoryRaw || null, categoryRaw: item.categoryRaw || item.category || null, categoryKey: catKey, price: item.price || null, addedDate: new Date().toISOString(), expires_at: item.expires_at || null, instrument_token: item.instrument_token || null };
          list.push(created); writeStocks(list); return sendJSON(res,200,created);
        }catch(e){ return sendJSON(res,400,{ok:false}); }
    }); return;
  }
  if(req.method==='DELETE' && req.url.startsWith('/api/stocks/')){
    const id = Number(req.url.split('/').pop()); const list = readStocks(); const idx=list.findIndex(x=>x.id===id);
    if(idx===-1) return sendJSON(res,404,{ok:false}); list.splice(idx,1); writeStocks(list); return sendJSON(res,200,{ok:true});
  }
  res.writeHead(404); res.end('Not Found');
});
const port = process.env.PORT||3001; server.listen(port,()=>console.log('shim listening',port));
