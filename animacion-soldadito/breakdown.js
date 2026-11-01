// Video "breakdown" para portafolio (1920×1080): final · rig con huesos · silueta · curvas de animación.
// Uso: node breakdown.js <carpeta_salida> [--fps 60] [--parte i/n]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const outDir = args[0];
const fpsIdx = args.indexOf('--fps');
const fps = fpsIdx >= 0 ? parseInt(args[fpsIdx + 1], 10) : 60;
const parteIdx = args.indexOf('--parte');
const [parte, partes] = parteIdx >= 0 ? args[parteIdx + 1].split('/').map(Number) : [0, 1];
const soloIdx = args.indexOf('--solo');
const solo = soloIdx >= 0 ? args[soloIdx + 1].split(',').map(Number) : null;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const dir = path.join(__dirname, 'piezas');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'piezas.json'), 'utf8'));
  const href = {};
  for (const name of Object.keys(meta.pieces)) {
    for (const n of [name, name + '_sil']) href[n] = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, n + '.png')).toString('base64');
  }
  const assets = { pieces: Object.fromEntries(Object.entries(meta.pieces).flatMap(([k, v]) => [[k, v], [k + '_sil', v]])), href, colors: meta.colors };
  const src = fs.readFileSync(path.join(__dirname, 'soldadito.js'), 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(`<!doctype html><html><head><style>
  html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#0d1430;font-family:'DejaVu Sans',Arial,sans-serif;color:#e8eeff}
  .t{position:absolute;left:48px;top:30px;font-size:40px;font-weight:700;letter-spacing:.5px}
  .st{position:absolute;left:50px;top:84px;font-size:20px;color:#9fb3e8}
  .p{position:absolute;top:140px;width:288px;height:902px;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px #0008}
  .lab{position:absolute;top:1046px;width:288px;text-align:center;font-size:17px;letter-spacing:2px;color:#9fb3e8}
  #rig{background:#20273f;background-image:linear-gradient(#ffffff0d 1px,transparent 1px),linear-gradient(90deg,#ffffff0d 1px,transparent 1px);background-size:24px 24px}
  #sil{background:#eef1f7}
  #cv{position:absolute;left:968px;top:140px;width:904px;height:902px}
  .tc{position:absolute;right:52px;top:44px;font-size:30px;font-variant-numeric:tabular-nums;color:#ffd23f;font-weight:700}
  </style></head><body>
  <div class="t">Soldadito Cascanueces — Animación 2D cutout</div>
  <div class="st">Estilo cartoon · 5 s en bucle · 60 fps · resortes (overshoot), squash &amp; stretch y física secundaria</div>
  <div class="tc" id="tc"></div>
  <div class="p" id="fin" style="left:48px"></div><div class="lab" style="left:48px">FINAL</div>
  <div class="p" id="rig" style="left:356px"></div><div class="lab" style="left:356px">RIG · HUESOS</div>
  <div class="p" id="sil" style="left:664px"></div><div class="lab" style="left:664px">SILUETA</div>
  <svg id="cv" viewBox="0 0 904 902"></svg>
  <script>${src}</script></body></html>`);
  await page.evaluate((a) => { window.__assets = a; }, assets);

  // Curvas (se dibujan una vez; el cursor se mueve por fotograma)
  await page.evaluate(() => {
    const S = window.Soldadito;
    const rows = [
      ['aLu', 'Hombro derecho — rotación', '#ff8a00', -40, 200],
      ['aLf', 'Codo derecho — rotación', '#ff5d8f', -120, 80],
      ['squash', 'Squash & stretch', '#7cf29c', -0.12, 0.12],
      ['barba', 'Barba — física secundaria', '#19c6ff', -8, 8],
    ];
    const c = S.curves(rows.map((r) => r[0]), 600);
    const W = 904, top = 10, gh = 168, gap = 34, x0 = 60, x1 = W - 16;
    let s = '';
    const sections = [[0, 1, 'Balanceo · parpadeo'], [1, 2, 'Saludo · paso lateral'], [2, 3, 'Brazos · caderas'], [3, 4, 'Pies · cabeza'], [4, 5, 'Salto · saludo militar']];
    rows.forEach(([k, name, col, lo, hi], r) => {
      const y0 = top + r * (gh + gap) + 26, y1 = y0 + gh - 30;
      const X = (i, n) => x0 + (x1 - x0) * (i / n), Y = (v) => y1 - (y1 - y0) * ((v - lo) / (hi - lo));
      s += `<text x="${x0}" y="${y0 - 10}" fill="#e8eeff" font-size="18" font-weight="700">${name}</text>`;
      s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#ffffff08" rx="6"/>`;
      for (let b = 0; b <= 10; b++) s += `<line x1="${X(b, 10)}" x2="${X(b, 10)}" y1="${y0}" y2="${y1}" stroke="#ffffff${b % 2 ? '10' : '22'}"/>`;
      if (lo < 0 && hi > 0) s += `<line x1="${x0}" x2="${x1}" y1="${Y(0)}" y2="${Y(0)}" stroke="#ffffff30" stroke-dasharray="4 6"/>`;
      const n = c[k].out.length - 1;
      if (k !== 'barba') s += `<polyline fill="none" stroke="#c8d3f0" stroke-opacity=".55" stroke-width="2" stroke-dasharray="7 6" points="${c[k].tgt.map((v, i) => `${X(i, n).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
      s += `<polyline fill="none" stroke="${col}" stroke-width="3.2" stroke-linejoin="round" points="${c[k].out.map((v, i) => `${X(i, n).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
      s += `<circle id="dot${r}" r="7" fill="${col}" stroke="#fff" stroke-width="2.5"/>`;
    });
    const ty = top + 4 * (gh + gap) + 14;
    sections.forEach(([a, b, name], i) => {
      const xa = x0 + (x1 - x0) * a / 5, xb = x0 + (x1 - x0) * b / 5;
      s += `<rect x="${xa + 2}" y="${ty}" width="${xb - xa - 4}" height="44" rx="8" fill="${['#2b3d7a', '#304a94', '#2b3d7a', '#304a94', '#2b3d7a'][i]}"/>
        <text x="${(xa + xb) / 2}" y="${ty + 28}" text-anchor="middle" fill="#dfe7ff" font-size="14">${name}</text>`;
    });
    for (let sct = 0; sct <= 5; sct++) s += `<text x="${x0 + (x1 - x0) * sct / 5}" y="${ty + 66}" text-anchor="middle" fill="#9fb3e8" font-size="14">${sct}s</text>`;
    s += `<text x="${x0}" y="${ty + 92}" fill="#9fb3e8" font-size="14">— — clave (objetivo)     ━ resultado con resorte / física</text>`;
    s += `<line id="ph" y1="${top}" y2="${ty + 46}" stroke="#ffd23f" stroke-width="2.5"/>`;
    document.getElementById('cv').innerHTML = s;
    window.__curves = { c, rows, x0, x1, top, gh, gap };
  });

  const nf = Math.round(5 * fps);
  const frames = solo ? solo.map((t) => [t, `b_${t.toFixed(2)}.png`]) : Array.from({ length: nf }, (_, i) => [i / fps, `b_${String(i).padStart(4, '0')}.png`]);
  for (let i = parte; i < frames.length; i += partes) {
    const [t, name] = frames[i];
    await page.evaluate(async (t) => {
      const S = window.Soldadito, a = window.__assets;
      document.getElementById('fin').innerHTML = S.drawFrame(t, { fondo: true, assets: a });
      document.getElementById('rig').innerHTML = S.drawFrame(t, { modo: 'rig', assets: a });
      document.getElementById('sil').innerHTML = S.drawFrame(t, { modo: 'silueta', assets: a });
      document.getElementById('tc').textContent = `${t.toFixed(2)} s  ·  fotograma ${String(Math.round(t * 60) + 1).padStart(3, '0')}/300`;
      const { c, rows, x0, x1, top, gh, gap } = window.__curves;
      const x = x0 + (x1 - x0) * (t / 5);
      document.getElementById('ph').setAttribute('x1', x); document.getElementById('ph').setAttribute('x2', x);
      rows.forEach(([k, , , lo, hi], r) => {
        const y0 = top + r * (gh + gap) + 26, y1 = y0 + gh - 30, arr = c[k].out, n = arr.length - 1;
        const v = arr[Math.round((t / 5) * n)];
        const d = document.getElementById('dot' + r);
        d.setAttribute('cx', x); d.setAttribute('cy', y1 - (y1 - y0) * ((v - lo) / (hi - lo)));
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t);
    await page.screenshot({ path: path.join(outDir, name) });
  }
  await browser.close();
  console.log('breakdown listo', outDir);
})();
