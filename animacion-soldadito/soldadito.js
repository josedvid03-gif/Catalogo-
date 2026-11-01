// Soldadito bailando: animación por recortes (cutout) de la ilustración ORIGINAL.
// Las piezas (cabeza, torso, brazos, piernas…) salen de la hoja de personaje con preparar_piezas.py;
// aquí solo se mueven y rotan, sin redibujarlas, para que el personaje se vea idéntico.
// drawFrame(t, {fondo, assets}) devuelve el SVG del instante t (0–5 s). Lienzo 620 × 1940 (proporción 62 × 194).
(function () {
  const W = 620, H = 1940, DUR = 5;
  const C = { line: '#16234d' };

  // ---------- Articulaciones (coordenadas R de la hoja original) ----------
  const NECK = [195, 362], WAIST = [195, 560], HIP_C = [195, 625];
  const SH = { L: [66, 412], R: [318, 412] };
  const ELB = { L: [67, 510], R: [317, 510] };
  const HIP = { L: [146, 625], R: [243, 625] };
  const KNEE = { L: [146, 704], R: [243, 704] };
  const ANKLE = { L: [146, 800], R: [243, 800] };
  const L1 = KNEE.L[1] - HIP.L[1], L2 = ANKLE.L[1] - KNEE.L[1];
  const SOLE = 877;

  // ---------- Utilidades de animación ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (x) => x * x * (3 - 2 * x);
  function key(t, ks) {
    if (t <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      if (t <= ks[i][0]) {
        const [t0, v0] = ks[i - 1], [t1, v1] = ks[i];
        return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
      }
    }
    return ks[ks.length - 1][1];
  }
  const TAU = Math.PI * 2;
  const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
  const rot = (p, c, a) => {
    const s = Math.sin(rad(a)), co = Math.cos(rad(a));
    const x = p[0] - c[0], y = p[1] - c[1];
    return [c[0] + x * co - y * s, c[1] + x * s + y * co];
  };
  const f = (n) => Math.round(n * 100) / 100;

  // ---------- Coreografía (120 BPM: un tiempo cada 0,5 s) ----------
  function pose(t) {
    const P = {};
    const swayEnv = key(t, [[0, 0], [0.15, 0], [0.9, 1], [3.9, 1], [4.5, 0.25], [5, 0]]);
    P.sway = swayEnv * 4 * Math.sin(TAU * t);

    const bounceEnv = key(t, [[0, 0], [0.5, 0], [1, 4], [2, 6], [4, 6], [4.55, 0], [5, 0]]);
    const bounce = bounceEnv * (1 + Math.cos(TAU * 2 * t)) / 2;

    const hipEnv = key(t, [[0, 0], [0.6, 0], [1, 3], [1.9, 3], [2.15, 12], [2.9, 12], [3.2, 5], [4, 3], [4.4, 0], [5, 0]]);
    const hipX = hipEnv * Math.sin(TAU * 2 * t);

    // Paso lateral (1–2 s) hacia la derecha del personaje; regreso alternando pies (3–4 s)
    const stepX = key(t, [[0, 0], [1, 0], [1.9, -14], [3, -14], [3.95, 0], [5, 0]]);
    P.pelvis = { x: stepX + hipX, y: bounce, r: -hipX * 0.3 };
    P.torso = P.sway - hipX * 0.2;

    const lift = (t0, t1, h) => (t > t0 && t < t1 ? h * Math.sin(Math.PI * (t - t0) / (t1 - t0)) : 0);
    const footL = {
      x: ANKLE.L[0] + key(t, [[0, 0], [1.05, 0], [1.45, -16], [3.5, -16], [3.92, 0], [5, 0]]),
      lift: lift(1.05, 1.45, 40) + lift(3.5, 3.92, 52) + lift(4.05, 4.3, 10),
    };
    const footR = {
      x: ANKLE.R[0] + key(t, [[0, 0], [1.5, 0], [1.9, -14], [3.02, -14], [3.45, 0], [5, 0]]),
      lift: lift(1.5, 1.9, 30) + lift(3.02, 3.45, 52) + lift(4.05, 4.3, 10),
    };
    footL.tilt = footL.lift * 0.3;
    footR.tilt = footR.lift * 0.3;
    P.feet = { L: footL, R: footR };

    const nodEnv = key(t, [[0, 0], [1, 0.3], [2.8, 0.5], [3, 1], [4, 1], [4.3, 0], [5, 0]]);
    P.head = {
      r: P.sway * 0.9 + nodEnv * 6 * Math.sin(TAU * 2 * t + 0.6),
      y: nodEnv * 4 * Math.abs(Math.sin(TAU * 2 * t)),
    };

    // Brazos. u = hombro, f = codo (grados; 0 = colgando; positivo = hacia fuera/arriba)
    const wave = Math.sin(TAU * 3 * t);
    const pump = Math.sin(TAU * 2 * t);
    const bump = (t0, t1) => (t > t0 && t < t1 ? Math.sin(Math.PI * (t - t0) / (t1 - t0)) : 0);
    const foldL = bump(1.0, 1.35) + bump(3.9, 4.2) + bump(4.55, 4.95);
    const foldR = bump(2.0, 2.32) + bump(2.85, 3.1) + bump(3.85, 4.15);
    const rUp = key(t, [[0, 0], [1, 0], [1.35, 1], [2.85, 1], [3.1, 0], [5, 0]]);
    const rPump = key(t, [[0, 0], [2.85, 0], [3.1, 1], [3.85, 1], [4.0, 0], [5, 0]]);
    const salute = key(t, [[0, 0], [3.9, 0], [4.2, 1], [4.55, 1], [4.95, 0], [5, 0]]);
    const waveAmt = key(t, [[0, 0], [1.3, 0], [1.45, 1], [2.1, 1], [2.35, 0.55], [2.85, 0.55], [3, 0], [5, 0]]);
    const lUp = key(t, [[0, 0], [2, 0], [2.32, 1], [2.85, 1], [3.1, 0], [5, 0]]);
    const lPump = key(t, [[0, 0], [2.85, 0], [3.1, 1], [3.85, 1], [4.15, 0], [5, 0]]);
    const lSway = Math.sin(TAU * 2 * t + Math.PI);
    const both = key(t, [[0, 0], [2.05, 0], [2.3, 1], [2.85, 1], [3, 0], [5, 0]]);
    P.armL = {
      u: 3 + rUp * (163 + both * 5 * lSway) + rPump * (6 + 6 * pump) + salute * 162 + P.sway * 0.4,
      f: rUp * (8 + waveAmt * 8 * wave) + rPump * (-55 - 20 * pump) + salute * 35 + foldL * 95,
    };
    P.armR = {
      u: 3 + lUp * (161 + 5 * lSway) + lPump * (6 - 6 * pump) - P.sway * 0.4 + key(t, [[0, 0], [1.1, 0], [1.4, 6], [2, 6], [2.2, 0], [5, 0]]),
      f: lUp * (8 + 6 * lSway) + lPump * (-55 + 20 * pump) + foldR * 95,
    };

    // Cara: parpadeo, ojos felices, guiño en el saludo, boca riendo
    const blink = (tc, d = 0.12) => 1 - clamp(1 - Math.abs(t - tc) / (d / 2), 0, 1);
    P.eyeOpen = Math.min(blink(0.36), blink(1.0, 0.16), blink(3.95, 0.16));
    P.happy = t > 1.0 && t < 3.95;
    P.wink = t > 4.18 && t < 4.6;
    const laughEnv = key(t, [[0, 0], [1.1, 0], [1.3, 1], [3.8, 1], [3.95, 0], [5, 0]]);
    P.mouth = laughEnv * (0.55 + 0.45 * Math.abs(Math.sin(TAU * 2 * t)));
    return P;
  }

  // ---------- Cinemática inversa de 2 huesos (rodillas hacia fuera) ----------
  function ik(hip, ankle, side) {
    const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1];
    const d = clamp(Math.hypot(dx, dy), 1, L1 + L2 - 0.01);
    const base = Math.atan2(dy, dx);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const ka = base + (side === 'L' ? 1 : -1) * a;
    const knee = [hip[0] + L1 * Math.cos(ka), hip[1] + L1 * Math.sin(ka)];
    return {
      knee,
      angThigh: deg(ka) - 90,
      angShin: deg(Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0])) - 90,
    };
  }

  // ---------- Piezas ----------
  let A = null; // { pieces: {nombre: {x,y,w,h}}, href: {nombre: url}, colors }
  const img = (n) => {
    const p = A.pieces[n];
    return `<image href="${A.href[n]}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="none"/>`;
  };
  const withSil = (n) => [img(n + '_sil'), img(n)];

  // Coloca una pieza: su punto de reposo 'rest' se lleva a 'pos' y se rota 'ang'
  const place = (rest, pos, ang) =>
    `translate(${f(pos[0])} ${f(pos[1])}) rotate(${f(ang)}) translate(${-rest[0]} ${-rest[1]})`;

  function leg(side, hip, ankle, tilt) {
    const { knee, angThigh, angShin } = ik(hip, ankle, side);
    const s = side === 'L' ? 1 : -1;
    const tT = place(HIP[side], hip, angThigh);
    const tS = place(KNEE[side], knee, angShin + s * tilt);
    const [thSil, th] = withSil('muslo_' + side), [shSil, sh] = withSil('pierna_' + side);
    return {
      sil: `<g transform="${tT}">${thSil}</g><g transform="${tS}">${shSil}</g>`,
      fill: `<g transform="${tT}">${th}</g><g transform="${tS}">${sh}</g>`,
    };
  }

  function arm(side, a) {
    const s = side === 'L' ? 1 : -1;
    const tU = `rotate(${f(s * a.u)} ${SH[side][0]} ${SH[side][1]})`;
    const tF = `rotate(${f(s * a.f)} ${ELB[side][0]} ${ELB[side][1]})`;
    const [uSil, u] = withSil('brazo_' + side), [fSil, fo] = withSil('antebrazo_' + side);
    return `<g transform="${tU}">${uSil}<g transform="${tF}">${fSil}${fo}</g>${u}</g>`;
  }

  function faceFx(P) {
    const skin = A.colors.face;
    const closed = (cx, cy, happy) => `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="17" fill="${skin}"/>` + (happy
      ? `<path d="M${cx - 12} ${cy + 5} Q${cx} ${cy - 11} ${cx + 12} ${cy + 5}" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>`
      : `<path d="M${cx - 11} ${cy + 1} Q${cx} ${cy + 7} ${cx + 11} ${cy + 1}" fill="none" stroke="#111" stroke-width="4.5" stroke-linecap="round"/>`);
    let s = '';
    const E = [[150, 252], [240, 252]];
    if (P.happy) s += closed(...E[0], true) + closed(...E[1], true);
    else if (P.eyeOpen < 0.5) s += closed(...E[0], false) + closed(...E[1], false);
    else if (P.wink) s += closed(...E[1], false);
    const mo = P.mouth;
    if (mo > 0.03) {
      s += `<path d="M178 338 Q195 ${f(338 + 30 * mo)} 212 338 Z" fill="#c8323a" stroke="${C.line}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M186 ${f(338 + 13 * mo)} Q195 ${f(338 + 24 * mo)} 204 ${f(338 + 13 * mo)}" fill="#f07a72" opacity="${mo > 0.35 ? 1 : 0}"/>`;
    }
    return s;
  }

  function character(P) {
    const pv = P.pelvis;
    const pt = (p) => { const q = rot(p, HIP_C, pv.r); return [q[0] + pv.x, q[1] + pv.y]; };
    const legL = leg('L', pt(HIP.L), [P.feet.L.x, ANKLE.L[1] - P.feet.L.lift], P.feet.L.tilt);
    const legR = leg('R', pt(HIP.R), [P.feet.R.x, ANKLE.R[1] - P.feet.R.lift], P.feet.R.tilt);
    const pelvisT = `translate(${f(pv.x)} ${f(pv.y)}) rotate(${f(pv.r)} ${HIP_C[0]} ${HIP_C[1]})`;
    return `
      ${legL.sil}${legR.sil}${legL.fill}${legR.fill}
      <g transform="${pelvisT}">
        <g transform="rotate(${f(P.torso)} ${WAIST[0]} ${WAIST[1]})">
          ${img('torso')}
          <g transform="translate(0 ${f(P.head.y)}) rotate(${f(P.head.r)} ${NECK[0]} ${NECK[1]})">${img('cabeza')}${faceFx(P)}</g>
          ${arm('L', P.armL)}${arm('R', P.armR)}
          ${img('charretera_L')}${img('charretera_R')}
        </g>
      </g>`;
  }

  // ---------- Fondo y efectos (versión con fondo) ----------
  function rand(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function star(x, y, s, col, op = 1) {
    return `<path transform="translate(${f(x)} ${f(y)}) scale(${f(s)})" opacity="${f(op)}" fill="${col}"
      d="M0 -20 Q3 -3 20 0 Q3 3 0 20 Q-3 3 -20 0 Q-3 -3 0 -20 Z"/>`;
  }
  function star5(x, y, r, rotDeg) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r, a = rad(rotDeg - 90 + i * 36);
      pts.push(`${f(x + rr * Math.cos(a))},${f(y + rr * Math.sin(a))}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="#ffd23f" stroke="#e8a20c" stroke-width="4" stroke-linejoin="round"/>
      <polygon points="${pts.join(' ')}" fill="none" stroke="#fff6c2" stroke-width="2" opacity=".6" transform="translate(-2 -2)"/>`;
  }
  function gift(x, y, w, h, body, ribbon) {
    return `<g transform="translate(${x} ${y})">
      <rect x="0" y="${h * 0.22}" width="${w}" height="${h * 0.78}" rx="6" fill="${body}" stroke="${C.line}" stroke-width="4"/>
      <rect x="-8" y="0" width="${w + 16}" height="${h * 0.25}" rx="6" fill="${body}" stroke="${C.line}" stroke-width="4"/>
      <rect x="${w / 2 - 12}" y="0" width="24" height="${h}" fill="${ribbon}" stroke="${C.line}" stroke-width="3"/>
      <path d="M${w / 2} 0 C${w / 2 - 50} -50 ${w / 2 - 70} 10 ${w / 2} 0 C${w / 2 + 70} 10 ${w / 2 + 50} -50 ${w / 2} 0 Z"
        fill="${ribbon}" stroke="${C.line}" stroke-width="4" stroke-linejoin="round"/>
      <rect x="6" y="${h * 0.3}" width="${w * 0.12}" height="${h * 0.6}" rx="4" fill="#fff" opacity=".15"/></g>`;
  }
  function background(t) {
    let s = `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0a2c86"/><stop offset=".45" stop-color="#1f7fe6"/>
        <stop offset=".7" stop-color="#36a6ff"/><stop offset="1" stop-color="#0d3a9c"/></linearGradient>
      <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#bfe8ff" stop-opacity=".55"/>
        <stop offset="1" stop-color="#bfe8ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".35"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <ellipse cx="310" cy="${f(1000 + 20 * Math.sin(TAU * t / 5))}" rx="420" ry="700" fill="url(#glow)"/>`;
    // Destellos titilantes (ciclo exacto de 5 s)
    for (let i = 0; i < 34; i++) {
      const x = rand(i) * W, y = rand(i + 50) * 1650, k = 1 + Math.floor(rand(i + 90) * 3);
      const tw = 0.5 + 0.5 * Math.sin(TAU * k * t / DUR + rand(i + 7) * TAU);
      s += star(x, y, 0.25 + 0.5 * tw * rand(i + 3), '#fff7d6', 0.35 + 0.6 * tw);
    }
    // Nieve suave (recorre una vez la altura en 5 s para que el bucle sea perfecto)
    for (let i = 0; i < 40; i++) {
      const y = ((rand(i + 200) * H + (t / DUR) * H) % H);
      const x = rand(i + 300) * W + 14 * Math.sin(TAU * 2 * t / DUR + i);
      s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + rand(i + 400) * 4)}" fill="#fff" opacity="${f(0.35 + rand(i + 500) * 0.45)}"/>`;
    }
    // Estrellas doradas grandes
    s += star5(150, 210 + 6 * Math.sin(TAU * t / DUR), 70, 8 * Math.sin(TAU * t / DUR));
    s += star5(500, 150 + 6 * Math.sin(TAU * t / DUR + 2), 38, -6 * Math.sin(TAU * t / DUR));
    s += `<ellipse cx="310" cy="1655" rx="330" ry="70" fill="url(#floor)"/>`;
    return s;
  }
  function foreground(t) {
    let s = gift(10, 1730, 200, 200, '#e23a2c', '#ffcf3a') + gift(400, 1700, 210, 230, '#1f9a4a', '#ffcf3a') +
      gift(215, 1810, 170, 140, '#ffcf3a', '#e23a2c');
    // Notas musicales (1,5–3 s)
    const notesA = key(t, [[0, 0], [1.4, 0], [1.7, 1], [2.9, 1], [3.2, 0], [5, 0]]);
    if (notesA > 0.01) {
      [[70, 340, 0], [552, 300, 1], [562, 620, 2], [58, 610, 3]].forEach(([x, y, i]) => {
        const dy = -30 * Math.sin(TAU * 2 * t + i), r = 12 * Math.sin(TAU * t + i);
        s += `<g transform="translate(${x} ${f(y + dy)}) rotate(${f(r)}) scale(1.3)" opacity="${f(notesA)}" fill="#ffd23f" stroke="${C.line}" stroke-width="2.5">
          ${i % 2 ? '<ellipse cx="-12" cy="22" rx="11" ry="8" transform="rotate(-20 -12 22)"/><ellipse cx="18" cy="16" rx="11" ry="8" transform="rotate(-20 18 16)"/><path d="M-2 22 L-2 -22 L28 -28 L28 16" fill="none" stroke-width="6"/><path d="M-2 -22 L28 -28" stroke-width="8"/>'
                  : '<ellipse cx="-8" cy="22" rx="12" ry="9" transform="rotate(-20 -8 22)"/><path d="M3 20 L3 -26 Q18 -16 20 -4" fill="none" stroke-width="6"/>'}</g>`;
      });
    }
    // Destellos del cierre (4–5 s)
    const sp = key(t, [[0, 0], [3.95, 0], [4.15, 1], [4.6, 1], [4.98, 0], [5, 0]]);
    if (sp > 0.01) {
      [[70, 520], [550, 480], [52, 860], [568, 820], [70, 1220], [552, 1250], [310, 400]].forEach(([x, y], i) => {
        const pulse = 0.7 + 0.3 * Math.sin(TAU * 4 * t + i);
        s += star(x, y, 1.6 * sp * pulse, '#ffe066', sp);
      });
    }
    return s;
  }

  // ---------- Fotograma ----------
  const S = 1.3;          // escala del personaje
  const GROUND = 1682;    // línea del suelo en el lienzo
  function drawFrame(t, opts = {}) {
    A = opts.assets;
    const P = pose(t);
    const ox = W / 2 - 195 * S, oy = GROUND - SOLE * S;
    const footLift = (P.feet.L.lift + P.feet.R.lift) / 2;
    const shadow = `<ellipse cx="${f(195 + P.pelvis.x * 0.7)}" cy="${SOLE + 2}" rx="${f(150 - footLift * 0.4)}" ry="15" fill="#000" opacity="${opts.fondo ? 0.28 : 0.22}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%">
      ${opts.fondo ? background(t) : ''}
      <g transform="translate(${f(ox)} ${f(oy)}) scale(${S})">${shadow}${character(P)}</g>
      ${opts.fondo ? foreground(t) : ''}
    </svg>`;
  }

  const api = { drawFrame, W, H, DUR };
  if (typeof window !== 'undefined') window.Soldadito = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
