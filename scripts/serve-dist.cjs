const http = require('http');
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const port = 5173;
const mime = {
  '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml'
};
const server = http.createServer((req,res)=>{
  const rel = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(dist, decodeURIComponent(rel.split('?')[0]));
  if (!file.startsWith(dist)) return res.writeHead(403).end('Forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isFile()){
    const ext = path.extname(file);
    res.writeHead(200, {'Content-Type': mime[ext] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  } else {
    // fallback to index.html for SPA
    const idx = path.join(dist, 'index.html');
    if (fs.existsSync(idx)){
      res.writeHead(200, {'Content-Type':'text/html'});
      fs.createReadStream(idx).pipe(res);
    } else {
      res.writeHead(404).end('Not found');
    }
  }
});
server.listen(port, '127.0.0.1', ()=>console.log('serving dist on http://127.0.0.1:'+port));
process.on('SIGINT', ()=>{ server.close(()=>process.exit(0)); });
