/* Local development server. Only public application files are served. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const publicFiles = new Set(['index.html','brand.html','design-system.html','manifest.webmanifest','sw.js']);
http.createServer((req,res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400);res.end('Bad request');return; }
  if (url === '/') url = '/index.html';
  const relative = url.replace(/^\//,'');
  const fp = path.resolve(__dirname,relative);
  const inside = fp.startsWith(__dirname + path.sep);
  const allowed = publicFiles.has(relative) || /^(assets|css|js|tokens)\/[\w./-]+$/.test(relative);
  if (!inside || !allowed || relative.split(/[\\/]/).includes('..')) { res.writeHead(403);res.end('Forbidden');return; }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{Allow:'GET, HEAD'});res.end();return; }
  fs.readFile(fp,(err,data) => {
    if (err) { res.writeHead(404);res.end('Not found');return; }
    res.writeHead(200,{'Content-Type':(MIME[path.extname(fp)] || 'application/octet-stream'),'X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(3000,'127.0.0.1',() => console.log('MATE:ON http://localhost:3000'));
