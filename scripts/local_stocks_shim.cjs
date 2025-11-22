const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());
const STOCKS_FILE = path.join(__dirname,'..','cts_stocks.json');
function readStocks(){
  try{ const s = fs.readFileSync(STOCKS_FILE,'utf8'); return JSON.parse(s||'[]'); }catch(e){ return []; }
}
function writeStocks(list){ fs.writeFileSync(STOCKS_FILE, JSON.stringify(list,null,2),'utf8'); }
app.get('/api/stocks',(req,res)=>{
  const list = readStocks();
  res.json(list);
});
app.post('/api/stocks',(req,res)=>{
  const item = req.body;
  const list = readStocks();
  const dup = list.find(x=> x.stockName===item.stockName && x.date===item.date && (x.categoryRaw===item.categoryRaw || x.categoryKey===item.categoryKey || x.category===item.category));
  if(dup){ return res.status(409).json({ ok:false, error:'DUPLICATE' }); }
  const id = Date.now(); item.id = id; item.addedDate = new Date().toISOString(); list.push(item); writeStocks(list); res.json({ ok:true, id });
});
app.delete('/api/stocks/:id',(req,res)=>{
  const id = Number(req.params.id);
  const list = readStocks();
  const idx = list.findIndex(x=>x.id===id);
  if(idx===-1) return res.status(404).json({ok:false});
  list.splice(idx,1); writeStocks(list); res.json({ok:true});
});
const port = process.env.PORT||3001;
app.listen(port,()=>console.log('local stocks shim listening on',port));
