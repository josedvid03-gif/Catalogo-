// Soldadito bailando — animación 2D cutout estilo cartoon, hecha con las piezas de la ilustración ORIGINAL.
//
// Técnica (principios de animación aplicados):
//  · Pose a pose con curvas spline monótonas (sin "frenazos" en cada clave).
//  · Resortes amortiguados sobre los canales principales → overshoot y asentamiento (snap cartoon).
//  · Anticipación antes de cada acción, transferencia de peso en los pasos y arcos naturales (rotación en articulaciones).
//  · Squash & stretch del cuerpo en saltos, aterrizajes y anticipaciones.
//  · Movimiento secundario con física (barba, mechones, faldones, charreteras) → follow-through y overlapping action.
//  · Párpados con cierre progresivo; bucle perfecto de 5 s (la simulación se estabiliza antes del ciclo que se muestra).
//
// drawFrame(t, {fondo, assets, modo}) devuelve el SVG del instante t (0–5 s). Lienzo 620 × 1940 (proporción 62 × 194).
// modo: 'final' (por defecto) | 'rig' (piezas + huesos) | 'silueta'.
(function () {
  const W = 620, H = 1940, DUR = 5;
  const C = { line: '#16234d' };

  // ---------- Articulaciones (coordenadas R de la hoja original) ----------
  const NECK = [195, 362], WAIST = [195, 560], HIP_C = [195, 625];
  const SH = { L: [66, 412], R: [318, 412] };
  const ELB = { L: [67, 510], R: [317, 510] };
  const HAND = { L: [61, 626], R: [323, 626] };
  const HIP = { L: [146, 625], R: [243, 625] };
  const KNEE = { L: [146, 704], R: [243, 704] };
  const ANKLE = { L: [146, 800], R: [243, 800] };
  const TOE = { L: [95, 860], R: [294, 860] };
  const L1 = KNEE.L[1] - HIP.L[1], L2 = ANKLE.L[1] - KNEE.L[1];
  const SOLE = 877;
  // Pivotes del movimiento secundario
  const SEC = {
    barba: { piv: [195, 343], tip: [195, 470] },
    pelo_L: { piv: [104, 222], tip: [30, 330] },
    pelo_R: { piv: [284, 222], tip: [362, 330] },
    faldon_L: { piv: [150, 566], tip: [86, 648] },
    faldon_R: { piv: [240, 566], tip: [304, 648] },
    charretera_L: { piv: [96, 378], tip: [52, 440] },
    charretera_R: { piv: [290, 378], tip: [336, 440] },
  };

  // ---------- Utilidades ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TAU = Math.PI * 2;
  const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
  const rot = (p, c, a) => {
    const s = Math.sin(rad(a)), co = Math.cos(rad(a));
    const x = p[0] - c[0], y = p[1] - c[1];
    return [c[0] + x * co - y * s, c[1] + x * s + y * co];
  };
  const f = (n) => Math.round(n * 100) / 100;
  const ease = (x) => x * x * (3 - 2 * x);
  function key(t, ks) { // suavizado simple (efectos del fondo)
    if (t <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      if (t <= ks[i][0]) {
        const [t0, v0] = ks[i - 1], [t1, v1] = ks[i];
        return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
      }
    }
    return ks[ks.length - 1][1];
  }
  // Spline cúbica monótona (Fritsch–Carlson): pasa por las claves, velocidad continua, sin rebotes falsos
  function spline(ks) {
    const n = ks.length, xs = ks.map((k) => k[0]), ys = ks.map((k) => k[1]);
    const d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    m[0] = 0; m[n - 1] = 0;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return (t) => {
      if (t <= xs[0]) return ys[0];
      if (t >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (t > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
      return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
    };
  }
  const bump = (t, t0, t1, h) => (t > t0 && t < t1 ? h * Math.sin(Math.PI * (t - t0) / (t1 - t0)) : 0);
  const pulse = (t, tc, w, h) => h * Math.exp(-(((t - tc) / w) ** 2));

  // ---------- Coreografía: claves (objetivos) a 120 BPM ----------
  const K = {
    // Brazo derecho del personaje (izquierda en pantalla). u = hombro, f = codo; 0 = colgando, + = hacia fuera/arriba
    aLu: spline([[0, 0], [0.5, 4], [0.85, 0], [1.0, -12], [1.16, 166], [1.95, 166], [2.25, 174], [2.5, 162], [2.75, 174], [2.88, 166],
      [3.02, 30], [3.12, 14], [3.85, 14], [3.96, 10], [4.06, -8], [4.24, 164], [4.55, 162], [4.8, -4], [5, 0]]),
    aLf: spline([[0, 0], [0.85, 0], [1.0, -18], [1.16, 10], [1.3, 32], [1.45, -14], [1.6, 32], [1.75, -14], [1.9, 28], [2.05, 8],
      [2.85, 8], [3.0, -40], [3.12, -62], [3.25, -102], [3.5, -45], [3.75, -102], [3.96, -50], [4.06, -30], [4.24, 36], [4.55, 36], [4.66, 70], [4.8, -6], [5, 0]]),
    // Brazo izquierdo del personaje (derecha en pantalla)
    aRu: spline([[0, 0], [0.5, -3], [1.0, 3], [1.92, 3], [2.0, -12], [2.16, 166], [2.25, 160], [2.5, 172], [2.75, 160], [2.88, 164],
      [3.02, 30], [3.12, 14], [3.85, 14], [4.0, 8], [4.12, -2], [4.24, 10], [4.45, 2], [5, 0]]),
    aRf: spline([[0, 0], [1.92, 0], [2.0, -16], [2.16, 10], [2.3, 22], [2.5, -4], [2.7, 22], [2.85, 8], [3.0, -40], [3.12, -100],
      [3.25, -45], [3.5, -100], [3.75, -45], [3.96, -60], [4.1, -10], [4.24, 12], [4.45, -4], [5, 0]]),
    // Cuerpo
    pelX: spline([[0, 0], [0.5, -5], [0.85, 4], [1.0, 6], [1.15, 2], [1.32, -9], [1.5, -10], [1.82, -18], [3.0, -18], [3.35, -9],
      [3.5, -8], [3.85, 0], [5, 0]]),
    torso: spline([[0, 0], [0.5, 3], [1.0, -4], [1.2, 5], [1.5, 3], [2.0, -2], [3.0, 0], [3.25, 4], [3.5, -4], [3.75, 4],
      [4.0, -2], [4.24, 3], [4.6, 2], [5, 0]]),
    head: spline([[0, 0], [0.5, 5], [1.0, -5], [1.2, -9], [1.5, -4], [1.75, -9], [2.0, -2], [2.25, 6], [2.5, -6], [2.75, 6],
      [3.0, -6], [3.25, 8], [3.5, -8], [3.75, 8], [4.0, -3], [4.3, -7], [4.6, -5], [4.85, 2], [5, 0]]),
    squash: spline([[0, 0], [0.92, 0], [1.0, 0.05], [1.12, -0.04], [1.32, 0.04], [1.5, 0], [1.82, 0.04], [2.0, -0.02], [2.15, -0.045],
      [2.4, 0], [3.0, 0], [3.37, 0.045], [3.6, 0], [3.87, 0.045], [3.95, 0.02], [4.03, 0.085], [4.14, -0.08], [4.3, 0.095], [4.42, 0], [5, 0]]),
    mouth: spline([[0, 0], [1.1, 0], [1.25, 0.8], [1.6, 1], [2.0, 0.7], [2.5, 1], [3.0, 0.8], [3.5, 1], [3.85, 0.7], [3.98, 0],
      [4.3, 0.5], [4.6, 0.5], [4.8, 0], [5, 0]]),
    groove: spline([[0, 0], [0.3, 0], [0.8, 4], [2.0, 6], [3.9, 6], [4.0, 0], [4.6, 0], [4.9, 1.5], [5, 0]]),
    hop: spline([[0, 0], [4.08, 0], [4.18, 26], [4.3, 0], [5, 0]]),
    crouch: spline([[0, 0], [3.92, 0], [4.03, 13], [4.1, 0], [4.28, 0], [4.36, 12], [4.5, 2], [4.62, 0], [5, 0]]),
    hips: spline([[0, 0], [2.0, 0], [2.2, 1], [2.85, 1], [3.05, 0], [5, 0]]),
    footLx: spline([[0, 0], [1.0, 0], [1.32, -18], [3.5, -18], [3.85, 0], [5, 0]]),
    footRx: spline([[0, 0], [1.5, 0], [1.82, -18], [3.0, -18], [3.35, 0], [5, 0]]),
    nod: spline([[0, 0], [2.9, 0], [3.05, 1], [3.95, 1], [4.1, 0], [5, 0]]),
  };

  // Canales con resorte: [frecuencia Hz, amortiguación ζ]. ζ < 1 → overshoot cartoon
  const SPRING = {
    aLu: [3.0, 0.5], aLf: [4.6, 0.42], aRu: [3.0, 0.5], aRf: [4.6, 0.42],
    pelX: [3.2, 0.75], torso: [2.6, 0.45], head: [3.4, 0.42], squash: [4.2, 0.32], mouth: [6, 0.55],
  };
  // Movimiento secundario: [Hz, ζ, longitud, ganancia de aleteo, límite en grados, rotación del padre]
  const SECP = {
    barba: [2.3, 0.3, 110, 0, 14, 'head', 1],
    pelo_L: [2.9, 0.3, 90, 0, 12, 'head', 0.55], pelo_R: [2.9, 0.3, 90, 0, 12, 'head', 0.55],
    faldon_L: [3.2, 0.26, 80, 1, 16, 'torso', 1], faldon_R: [3.2, 0.26, 80, -1, 16, 'torso', 1],
    charretera_L: [4.2, 0.32, 50, 0, 12, 'torso', 0.45], charretera_R: [4.2, 0.32, 50, 0, 12, 'torso', 0.45],
  };

  // Pose "cruda" (objetivos) en el instante t
  function targets(t) {
    const o = {};
    for (const k of Object.keys(K)) o[k] = K[k](t);
    return o;
  }

  // ---------- Simulación (se calcula una vez; 3 ciclos para que el bucle empalme perfecto) ----------
  const SIM_DT = 1 / 600, N = Math.round(DUR / SIM_DT);
  let SIM = null;
  function simulate() {
    const chans = Object.keys(SPRING), secs = Object.keys(SECP);
    const st = {}; chans.forEach((c) => (st[c] = { x: K[c](0), v: 0 }));
    const ss = {}; secs.forEach((c) => (ss[c] = { x: 0, v: 0 }));
    const out = { t: {}, s: {} };
    chans.forEach((c) => (out.t[c] = new Float32Array(N + 1)));
    secs.forEach((c) => (out.s[c] = new Float32Array(N + 1)));
    let prev = null, prev2 = null;
    for (let cyc = 0; cyc < 3; cyc++) {
      for (let i = 0; i < N; i++) {
        const t = i * SIM_DT, T = targets(t);
        // Canales principales (resortes)
        for (const c of chans) {
          const [hz, z] = SPRING[c], w = TAU * hz, s = st[c];
          const a = w * w * (T[c] - s.x) - 2 * z * w * s.v;
          s.v += a * SIM_DT; s.x += s.v * SIM_DT;
        }
        // Pose resultante → posiciones/rotaciones de los padres para el secundario
        const vals = {}; chans.forEach((c) => (vals[c] = st[c].x));
        const P = buildPose(t, vals, null);
        const cur = framesOf(P);
        if (prev && prev2) {
          for (const c of secs) {
            const [hz, z, L, flare, lim, parent, gain] = SECP[c], w = TAU * hz, s = ss[c];
            const piv = SEC[c].piv;
            const p0 = cur.pt(parent, piv), p1 = prev.pt(parent, piv), p2 = prev2.pt(parent, piv);
            const ax = (p0[0] - 2 * p1[0] + p2[0]) / (SIM_DT * SIM_DT);
            const ay = (p0[1] - 2 * p1[1] + p2[1]) / (SIM_DT * SIM_DT);
            const ar = (cur.rot[parent] - 2 * prev.rot[parent] + prev2.rot[parent]) / (SIM_DT * SIM_DT);
            // Inercia: el péndulo se retrasa respecto a la aceleración del pivote y al giro del padre
            let a = -w * w * s.x - 2 * z * w * s.v + gain * (deg(ax / L) * 0.9 - ar * 0.85 - flare * deg(ay / L) * 0.35);
            s.v += a * SIM_DT; s.x += s.v * SIM_DT;
            if (Math.abs(s.x) > lim) { s.x = Math.sign(s.x) * lim; s.v *= -0.3; }
          }
        }
        prev2 = prev; prev = cur;
        if (cyc === 2) {
          chans.forEach((c) => (out.t[c][i] = st[c].x));
          secs.forEach((c) => (out.s[c][i] = ss[c].x));
        }
      }
    }
    chans.forEach((c) => (out.t[c][N] = out.t[c][0]));
    secs.forEach((c) => (out.s[c][N] = out.s[c][0]));
    return out;
  }
  function sample(arr, t) {
    const x = (((t % DUR) + DUR) % DUR) / SIM_DT, i = Math.floor(x), u = x - i;
    return arr[i] * (1 - u) + arr[Math.min(i + 1, N)] * u;
  }

  // ---------- Pose completa ----------
  function buildPose(t, v, sec) {
    const P = {};
    const beat = 0.5 * (1 + Math.cos(TAU * 2 * t)); // 1 en cada tiempo
    const groove = K.groove(t);
    const hipShake = K.hips(t) * 10 * Math.sin(TAU * 2 * (t - 2));
    const hop = K.hop(t);
    const dips = pulse(t, 1.34, 0.05, 6) + pulse(t, 1.84, 0.05, 6) + pulse(t, 3.37, 0.05, 6) + pulse(t, 3.87, 0.05, 6);
    P.pelvis = {
      x: v.pelX + hipShake,
      y: groove * beat + K.crouch(t) + dips - hop,
      r: -hipShake * 0.3,
    };
    P.squash = clamp(v.squash + 0.012 * groove * beat / 6, -0.1, 0.11);
    P.torso = v.torso - hipShake * 0.25;
    P.head = { r: v.head, y: K.nod(t) * 4 * Math.abs(Math.sin(TAU * 2 * t)) };
    P.armL = { u: v.aLu, f: v.aLf };
    P.armR = { u: v.aRu, f: v.aRf };
    const lift = (t0, t1, h) => bump(t, t0, t1, h);
    P.feet = {
      L: { x: ANKLE.L[0] + K.footLx(t), lift: lift(1.0, 1.32, 42) + lift(3.5, 3.85, 56) + hop },
      R: { x: ANKLE.R[0] + K.footRx(t), lift: lift(1.5, 1.82, 34) + lift(3.0, 3.35, 56) + hop },
    };
    P.feet.L.tilt = P.feet.L.lift * 0.3 + lift(3.5, 3.85, 10);
    P.feet.R.tilt = P.feet.R.lift * 0.3 + lift(3.0, 3.35, 10);
    // Cara
    const lid = (t0, t1, t2) => (t < t0 || t > t2 ? 0 : t < t1 ? ease((t - t0) / (t1 - t0)) : 1 - ease((t - t1) / (t2 - t1)));
    P.happy = t >= 0.98 && t < 3.93;
    P.lidL = Math.max(lid(0.3, 0.36, 0.44), lid(0.9, 0.98, 1.06), lid(3.86, 3.93, 4.01));
    P.lidR = Math.max(P.lidL, t >= 4.27 && t <= 4.66 ? (t < 4.33 ? ease((t - 4.27) / 0.06) : t > 4.6 ? 1 - ease((t - 4.6) / 0.06) : 1) : 0);
    P.mouth = clamp(v.mouth * (P.happy ? 0.7 + 0.3 * beat : 1), 0, 1.1);
    P.sec = sec || {};
    return P;
  }
  function poseAt(t) {
    if (!SIM) SIM = simulate();
    const v = {}; for (const c of Object.keys(SPRING)) v[c] = sample(SIM.t[c], t);
    const sec = {}; for (const c of Object.keys(SECP)) sec[c] = sample(SIM.s[c], t);
    return buildPose(t, v, sec);
  }

  // Transformaciones de cada marco (también usadas por la simulación)
  function framesOf(P) {
    const pv = P.pelvis, sy = 1 - P.squash, sx = 1 / sy;
    const pel = (p) => { const q = rot(p, HIP_C, pv.r); return [q[0] + pv.x, q[1] + pv.y]; };
    const sq = (p) => [HIP_C[0] + (p[0] - HIP_C[0]) * sx, HIP_C[1] + (p[1] - HIP_C[1]) * sy];
    const tor = (p) => rot(p, WAIST, P.torso);
    const hed = (p) => rot([p[0], p[1] + P.head.y], NECK, P.head.r);
    const chain = { torso: (p) => pel(sq(tor(p))), head: (p) => pel(sq(tor(hed(p)))), pelvis: (p) => pel(sq(p)) };
    return {
      pt: (frame, p) => chain[frame](p),
      rot: { torso: pv.r + P.torso, head: pv.r + P.torso + P.head.r },
      pv, sx, sy,
    };
  }

  // ---------- Cinemática inversa de 2 huesos (rodillas hacia fuera) ----------
  function ik(hip, ankle, side) {
    const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1];
    const d = clamp(Math.hypot(dx, dy), 1, L1 + L2 - 0.01);
    const base = Math.atan2(dy, dx);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const ka = base + (side === 'L' ? 1 : -1) * a;
    const knee = [hip[0] + L1 * Math.cos(ka), hip[1] + L1 * Math.sin(ka)];
    return { knee, angThigh: deg(ka) - 90, angShin: deg(Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0])) - 90 };
  }

  // ---------- Dibujo ----------
  let A = null, MODE = 'final';
  const img = (n) => {
    const p = A.pieces[n];
    return `<image href="${A.href[n]}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="none"/>`;
  };
  const withSil = (n) => [img(n + '_sil'), img(n)];
  const place = (rest, pos, ang) => `translate(${f(pos[0])} ${f(pos[1])}) rotate(${f(ang)}) translate(${-rest[0]} ${-rest[1]})`;
  // Huesos para el modo 'rig'
  const bone = (a, b, col = '#ff8a00') => MODE !== 'rig' ? '' :
    `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${col}" stroke-width="5" stroke-linecap="round" opacity=".95"/>
     <circle cx="${a[0]}" cy="${a[1]}" r="7" fill="#fff" stroke="${col}" stroke-width="3.5"/>`;
  const secRot = (P, n) => {
    const s = SEC[n];
    return `<g transform="rotate(${f(P.sec[n] || 0)} ${s.piv[0]} ${s.piv[1]})">${img(n)}${bone(s.piv, s.tip, '#19c6ff')}</g>`;
  };

  function leg(side, hip, ankle, tilt) {
    const { knee, angThigh, angShin } = ik(hip, ankle, side);
    const s = side === 'L' ? 1 : -1;
    const tT = place(HIP[side], hip, angThigh);
    const tS = place(KNEE[side], knee, angShin + s * tilt);
    const [thSil, th] = withSil('muslo_' + side), [shSil, sh] = withSil('pierna_' + side);
    return {
      sil: `<g transform="${tT}">${thSil}</g><g transform="${tS}">${shSil}</g>`,
      fill: `<g transform="${tT}">${th}${bone(HIP[side], KNEE[side])}</g><g transform="${tS}">${sh}${bone(KNEE[side], ANKLE[side])}${bone(ANKLE[side], TOE[side])}</g>`,
    };
  }

  function arm(side, a) {
    const s = side === 'L' ? 1 : -1;
    const tU = `rotate(${f(s * a.u)} ${SH[side][0]} ${SH[side][1]})`;
    const tF = `rotate(${f(s * a.f)} ${ELB[side][0]} ${ELB[side][1]})`;
    const [uSil, u] = withSil('brazo_' + side), [fSil, fo] = withSil('antebrazo_' + side);
    return `<g transform="${tU}">${uSil}<g transform="${tF}">${fSil}${fo}${bone(ELB[side], HAND[side])}</g>${u}${bone(SH[side], ELB[side])}</g>`;
  }

  function eye(cx, cy, lid, happy, id) {
    const skin = A.colors.face;
    if (happy && lid < 0.5) {
      return `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="17" fill="${skin}"/>
        <path d="M${cx - 12} ${cy + 5} Q${cx} ${cy - 12} ${cx + 12} ${cy + 5}" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>`;
    }
    if (lid <= 0.02) return '';
    if (lid >= 0.95) {
      return `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="17" fill="${skin}"/>
        <path d="M${cx - 11} ${cy + 2} Q${cx} ${cy + 8} ${cx + 11} ${cy + 2}" fill="none" stroke="#111" stroke-width="4.5" stroke-linecap="round"/>`;
    }
    // Párpado bajando (cierre progresivo)
    const top = cy - 16, yl = top + 32 * lid;
    return `<clipPath id="ce${id}"><ellipse cx="${cx}" cy="${cy}" rx="12.5" ry="16.5"/></clipPath>
      <g clip-path="url(#ce${id})"><rect x="${cx - 14}" y="${top - 2}" width="28" height="${f(yl - top + 2)}" fill="${skin}"/></g>
      <path d="M${cx - 11} ${f(yl)} Q${cx} ${f(yl + 4)} ${cx + 11} ${f(yl)}" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round"/>`;
  }

  function faceFx(P) {
    let s = eye(150, 252, P.lidL, P.happy, 'L') + eye(240, 252, P.lidR, P.happy, 'R');
    const mo = P.mouth;
    if (mo > 0.03) {
      s += `<path d="M178 338 Q195 ${f(338 + 30 * mo)} 212 338 Z" fill="#c8323a" stroke="${C.line}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M186 ${f(338 + 13 * mo)} Q195 ${f(338 + 24 * mo)} 204 ${f(338 + 13 * mo)}" fill="#f07a72" opacity="${f(clamp((mo - 0.3) * 3, 0, 1))}"/>`;
    }
    return s;
  }

  function character(P) {
    const F = framesOf(P);
    const hipL = F.pt('pelvis', HIP.L), hipR = F.pt('pelvis', HIP.R);
    const legL = leg('L', hipL, [P.feet.L.x, ANKLE.L[1] - P.feet.L.lift], P.feet.L.tilt);
    const legR = leg('R', hipR, [P.feet.R.x, ANKLE.R[1] - P.feet.R.lift], P.feet.R.tilt);
    const pv = P.pelvis;
    const pelvisT = `translate(${f(pv.x)} ${f(pv.y)}) rotate(${f(pv.r)} ${HIP_C[0]} ${HIP_C[1]})`;
    const squashT = `translate(${HIP_C[0]} ${HIP_C[1]}) scale(${f(F.sx * 1000) / 1000} ${f(F.sy * 1000) / 1000}) translate(${-HIP_C[0]} ${-HIP_C[1]})`;
    return `
      ${legL.sil}${legR.sil}${legL.fill}${legR.fill}
      <g transform="${pelvisT}"><g transform="${squashT}">
        ${img('pelvis')}
        ${secRot(P, 'faldon_L')}${secRot(P, 'faldon_R')}
        <g transform="rotate(${f(P.torso)} ${WAIST[0]} ${WAIST[1]})">
          ${img('torso')}${bone(HIP_C, WAIST)}${bone(WAIST, NECK)}
          <g transform="translate(0 ${f(P.head.y)}) rotate(${f(P.head.r)} ${NECK[0]} ${NECK[1]})">
            ${secRot(P, 'pelo_L')}${secRot(P, 'pelo_R')}${secRot(P, 'barba')}
            ${img('cabeza')}${MODE === 'silueta' ? '' : faceFx(P)}${bone(NECK, [195, 150])}${bone([195, 150], [195, 20])}
          </g>
          ${arm('L', P.armL)}${arm('R', P.armR)}
          ${secRot(P, 'charretera_L')}${secRot(P, 'charretera_R')}
        </g>
      </g></g>`;
  }

  // Curvas para el breakdown (objetivo vs. resultado con resorte)
  function curves(names, n = 400) {
    if (!SIM) SIM = simulate();
    const res = {};
    for (const c of names) {
      const tgt = [], out = [];
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * DUR;
        tgt.push(K[c] ? K[c](t) : 0);
        out.push(SIM.t[c] ? sample(SIM.t[c], t) : SIM.s[c] ? sample(SIM.s[c], t) : 0);
      }
      res[c] = { tgt, out };
    }
    return res;
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
    const sp = key(t, [[0, 0], [4.25, 0], [4.36, 1], [4.7, 1], [4.98, 0], [5, 0]]);
    if (sp > 0.01) {
      [[70, 520], [550, 480], [52, 860], [568, 820], [70, 1220], [552, 1250], [310, 400]].forEach(([x, y], i) => {
        const pulse = 0.7 + 0.3 * Math.sin(TAU * 4 * t + i);
        s += star(x, y, 1.6 * sp * pulse, '#ffe066', sp);
      });
    }
    return s;
  }

  // ---------- Fotograma ----------
  const S = 1.28;         // escala del personaje
  const GROUND = 1682;    // línea del suelo en el lienzo
  function drawFrame(t, opts = {}) {
    A = opts.assets;
    MODE = opts.modo || 'final';
    const P = poseAt(t);
    const ox = W / 2 - 195 * S, oy = GROUND - SOLE * S;
    const footLift = (P.feet.L.lift + P.feet.R.lift) / 2;
    const shadow = `<ellipse cx="${f(195 + P.pelvis.x * 0.7)}" cy="${SOLE + 2}" rx="${f(150 - footLift * 0.9)}" ry="${f(15 - footLift * 0.1)}" fill="#000" opacity="${f((opts.fondo ? 0.28 : 0.22) * (1 - footLift / 80))}"/>`;
    const silFilter = MODE === 'silueta'
      ? `<filter id="silf"><feColorMatrix type="matrix" values="0 0 0 0 0.06  0 0 0 0 0.08  0 0 0 0 0.16  0 0 0 1 0"/></filter>` : '';
    const charOpacity = MODE === 'rig' ? 'opacity="0.55"' : '';
    let body = character(P);
    if (MODE === 'rig') {
      // piezas semitransparentes + huesos opacos encima
      const bonesOnly = body;
      MODE = 'final';
      const plain = character(P);
      MODE = 'rig';
      body = `<g ${charOpacity}>${plain}</g>${bonesOnly.replace(/<image [^>]*>/g, '')}`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%">
      <defs>${silFilter}</defs>
      ${opts.fondo ? background(t) : ''}
      <g transform="translate(${f(ox)} ${f(oy)}) scale(${S})">${MODE === 'final' ? shadow : ''}
        <g ${MODE === 'silueta' ? 'filter="url(#silf)"' : ''}>${body}</g></g>
      ${opts.fondo ? foreground(t) : ''}
    </svg>`;
  }

  const api = { drawFrame, curves, W, H, DUR };
  if (typeof window !== 'undefined') window.Soldadito = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
