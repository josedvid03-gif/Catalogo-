// Renderiza los fotogramas PNG con Chromium (Playwright).
// Uso: node render.js <carpeta_salida> <ancho_px> [--fondo] [--fps 60] [--blur 4] [--modo final|rig|silueta] [--solo t1,t2,...]
// --blur N: N sub-fotogramas por fotograma dentro de un obturador de 180° (desenfoque de movimiento; se promedian con blur.py)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const outDir = args[0];
const width = parseInt(args[1] || '620', 10);
const fondo = args.includes('--fondo');
const fpsIdx = args.indexOf('--fps');
const fps = fpsIdx >= 0 ? parseInt(args[fpsIdx + 1], 10) : 60;
const blurIdx = args.indexOf('--blur');
const blur = blurIdx >= 0 ? parseInt(args[blurIdx + 1], 10) : 1;
const modoIdx = args.indexOf('--modo');
const modo = modoIdx >= 0 ? args[modoIdx + 1] : 'final';
const soloIdx = args.indexOf('--solo');
const solo = soloIdx >= 0 ? args[soloIdx + 1].split(',').map(Number) : null;
const parteIdx = args.indexOf('--parte'); // --parte i/n : reparte el trabajo entre n procesos
const [parte, partes] = parteIdx >= 0 ? args[parteIdx + 1].split('/').map(Number) : [0, 1];

(async () => {
  const { W, H, DUR } = require('./soldadito.js');
  const height = Math.round((width * H) / W / 2) * 2; // alto par (requisito de H.264)
  fs.mkdirSync(outDir, { recursive: true });

  // Piezas recortadas de la ilustración original, embebidas como data URI
  const dir = path.join(__dirname, 'piezas');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'piezas.json'), 'utf8'));
  const href = {};
  for (const name of Object.keys(meta.pieces)) {
    for (const n of [name, name + '_sil']) {
      href[n] = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, n + '.png')).toString('base64');
    }
  }
  const assets = { pieces: Object.fromEntries(Object.entries(meta.pieces).flatMap(([k, v]) => [[k, v], [k + '_sil', v]])), href, colors: meta.colors };

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const src = fs.readFileSync(path.join(__dirname, 'soldadito.js'), 'utf8');
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    #s{width:${width}px;height:${height}px}</style></head><body><div id="s"></div><script>${src}</script></body></html>`);
  await page.evaluate((a) => { window.__assets = a; }, assets);
  await page.evaluate(() => window.Soldadito.drawFrame(0, { assets: window.__assets })); // precalcula la simulación

  // Lista de (tiempo, nombre). Con --blur, sub-fotogramas centrados en el instante del fotograma (obturador 180°)
  const jobs = [];
  if (solo) solo.forEach((t) => jobs.push([t, `t_${t.toFixed(2)}.png`]));
  else {
    const nf = Math.round(DUR * fps);
    for (let i = 0; i < nf; i++) {
      for (let k = 0; k < blur; k++) {
        const off = blur > 1 ? ((k + 0.5) / blur - 0.5) * (0.5 / fps) : 0;
        jobs.push([(i / fps + off + DUR) % DUR, blur > 1 ? `f_${String(i).padStart(4, '0')}_${k}.png` : `f_${String(i).padStart(4, '0')}.png`]);
      }
    }
  }
  const times = jobs;
  for (let i = parte; i < jobs.length; i += partes) {
    await page.evaluate(async ([t, fondo, modo]) => {
      document.getElementById('s').innerHTML = window.Soldadito.drawFrame(t, { fondo, modo, assets: window.__assets });
      await Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
      await Promise.all([...document.querySelectorAll('image')].map(() => new Promise((r) => requestAnimationFrame(r))));
    }, [jobs[i][0], fondo, modo]);
    await page.screenshot({ path: path.join(outDir, jobs[i][1]), omitBackground: !fondo });
  }
  await browser.close();
  console.log(`${times.length} fotogramas ${width}x${height} en ${outDir}`);
})();
