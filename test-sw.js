const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const events = {}, calls = [], writes = [];
let offline = false;
const origin = 'https://gyeongbin-38.github.io';
const context = {
  URL, Request, Response,
  self: {location:{origin}, addEventListener:(n,f)=>events[n]=f},
  fetch: async (request, options) => {calls.push(options);if(offline)throw Error('offline');return new Response('network');},
  caches: {open:async()=>({put:async request=>writes.push(request.url)}),match:async()=>new Response('cached')}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('sw.js','utf8')+'\nglobalThis.shell=SHELL;',context);
const html=fs.readFileSync('index.html','utf8');
const refs=[...html.matchAll(/(?:src|href)="((?:js|css)\/[^\"]+)"/g)].map(m=>m[1]);
assert.equal(refs.length,18);
refs.forEach(ref=>assert(context.shell.includes(ref),'Versioned resource must be precached: '+ref));
async function request(path,mode='cors'){
 let response;const pending=[];
 events.fetch({request:{method:'GET',url:origin+'/mateon/'+path,mode},respondWith:p=>response=p,waitUntil:p=>pending.push(p)});
 const result=await response;await Promise.all(pending);return result;
}
(async()=>{
 assert.equal(await (await request(refs[0])).text(),'network');
 assert.equal(calls.at(-1).cache,'no-cache');
 assert.equal(writes.length,1);
 await request('?invite=private-result','navigate');
 assert.equal(writes.length,1,'Private result URLs must never enter the cache');
 offline=true;
 assert.equal(await (await request(refs[0])).text(),'cached');
 assert.equal(await (await request('?invite=private-result','navigate')).text(),'cached');
 const native=fs.readFileSync('dist/index.html','utf8');
 assert(native.indexOf('js/native.js')<native.indexOf('js/data.js'));
 assert(native.includes('js/native.js'),'Versioning must preserve native bridge injection');
 console.log('PASS: versioned assets, HTTP revalidation, offline fallback, private links, native bridge');
})().catch(e=>{console.error(e);process.exitCode=1;});
