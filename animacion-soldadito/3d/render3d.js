// Renderiza el soldadito 3D con Chromium (WebGL por software) y guarda PNG con transparencia.
// Uso: node render3d.js <carpeta_salida> <ancho_px> [--fps 60] [--blur 2] [--capa personaje|regalos|todo]
//                       [--solo t1,t2,...] [--vista grados] [--parte i/n]
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const outDir = args[0];
const width = parseInt(args[1] || '620', 10);
const height = Math.round((width * 1940) / 620 / 2) * 2;
const fps = parseInt(opt('fps', '60'), 10), blur = parseInt(opt('blur', '1'), 10);
const capa = opt('capa', 'personaje'), vista = parseFloat(opt('vista', '0'));
const solo = opt('solo', null) ? opt('solo').split(',').map(Number) : null;
const [parte, partes] = opt('parte', '0/1').split('/').map(Number);
const DUR = 5;

const MIME = { '.js': 'text/javascript', '.png': 'image/png', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: Math.min(width, 1280), height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.route('**/escena.html', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
      <style>html,body{margin:0;background:transparent}</style></head><body><canvas id="c" width="${width}" height="${height}"></canvas>
      <script type="module">import * as S from '/soldado3d.js'; window.S = S; window.ready = S.init(document.getElementById('c'), ${width}, ${height}, { emblemUrl: '/emblema.png' });</script></body></html>`,
  }));
  await page.goto(`http://127.0.0.1:${port}/escena.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await page.evaluate(async (v) => { await window.ready; if (v) window.S.setView(v); }, vista);

  const jobs = [];
  if (solo) solo.forEach((t) => jobs.push([t, `t_${t.toFixed(2)}.png`]));
  else {
    const nf = Math.round(DUR * fps);
    for (let i = 0; i < nf; i++) for (let k = 0; k < blur; k++) {
      const off = blur > 1 ? ((k + 0.5) / blur - 0.5) * (0.5 / fps) : 0;
      jobs.push([(i / fps + off + DUR) % DUR, blur > 1 ? `f_${String(i).padStart(4, '0')}_${k}.png` : `f_${String(i).padStart(4, '0')}.png`]);
    }
  }
  const t0 = Date.now();
  for (let i = parte; i < jobs.length; i += partes) {
    const b64 = await page.evaluate(([t, capa]) => {
      window.S.render(t, capa);
      return document.getElementById('c').toDataURL('image/png').split(',')[1];
    }, [jobs[i][0], capa]);
    fs.writeFileSync(path.join(outDir, jobs[i][1]), Buffer.from(b64, 'base64'));
  }
  await browser.close(); server.close();
  console.log(`${Math.ceil((jobs.length - parte) / partes)} fotogramas ${width}x${height} en ${((Date.now() - t0) / 1000).toFixed(1)} s → ${outDir}`);
})();
