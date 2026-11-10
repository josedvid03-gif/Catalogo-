// Soldadito Cascanueces — "dibujo con volumen": modelo 3D que se renderiza con el aspecto de la ilustración.
// · El cuerpo se construye con volúmenes siguiendo las vistas de frente, lado y espalda de la hoja de personaje.
// · Se pinta como el dibujo: colores planos con sombreado suave (toon) y línea de contorno oscura en cada pieza
//   (detección de bordes por identificador de pieza), más el emblema original del sombrero.
// · Animación: claves con splines monótonas + resortes (overshoot) + física secundaria (barba, sombrero, faldones,
//   charreteras) + cinemática inversa 3D en las piernas. Bucle perfecto de 5 s.
import * as THREE from 'three';

export const DUR = 5;
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Paleta (de la ilustración) ----------
const COL = {
  hat: 0x2c4399, band: 0x0f1a3a, light: 0xb7d6f8, jacket: 0x263c8f, pants: 0x4662c0, boot: 0x141f3a,
  skin: 0xfde1c0, nose: 0xffe9cf, cheek: 0xf2512f, white: 0xfbfaf7, brow: 0x2b1f1a, eye: 0x0c0c10, mouth: 0xc02c38,
  line: 0x141d3f,
};
// Rampa de sombreado suave: lado en sombra ≈ 72 % del color, lado iluminado = color del dibujo
let RAMP = null;
function ramp() {
  const n = 32, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), s = clamp((t - 0.3) / 0.42, 0, 1), v = 0.72 + 0.28 * s * s * (3 - 2 * s);
    data.set([v * 255, v * 255, v * 255, 255], i * 4);
  }
  const tx = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tx.minFilter = tx.magFilter = THREE.LinearFilter; tx.needsUpdate = true;
  return tx;
}
const mat = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP, side: o.side ?? THREE.FrontSide });
const flat = (color) => new THREE.MeshBasicMaterial({ color });
const M = {};
function materials() {
  RAMP = ramp();
  M.hat = mat(COL.hat); M.band = mat(COL.band); M.light = mat(COL.light); M.light2 = mat(0xdcebff);
  M.jacket = mat(COL.jacket); M.jacket2 = mat(COL.jacket, { side: THREE.DoubleSide });
  M.pants = mat(COL.pants); M.boot = mat(COL.boot);
  M.skin = mat(COL.skin); M.nose = mat(COL.nose); M.cheek = flat(COL.cheek);
  M.white = mat(COL.white); M.white2 = mat(COL.white, { side: THREE.DoubleSide });
  M.brow = flat(COL.brow); M.eye = flat(COL.eye); M.mouth = flat(COL.mouth);
  M.shine = flat(0xffffff); M.bootShine = flat(0x8d9cc0);
}

// ---------- Utilidades de modelado ----------
// LINE decide el contorno: null → cada malla es una pieza con su propio contorno; 'nombre' → las mallas con el
// mismo nombre forman una sola pieza; 'none' → detalle sin contorno propio.
let LINE = null, autoId = 0;
const IDS = new Map();
function idMaterial(key) {
  if (!IDS.has(key)) {
    const i = IDS.size + 1;
    const c = new THREE.Color().setRGB((i % 16) / 15, (Math.floor(i / 16) % 16) / 15, 1);
    IDS.set(key, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  }
  return IDS.get(key);
}
function mesh(geo, material, parent, pos, scale, rot) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  if (rot) m.rotation.set(...rot);
    const key = LINE === null ? 'auto' + autoId++ : LINE;
  m.userData.colorMat = material;
  m.userData.idMat = key === 'none' ? null : idMaterial(key);
  if (parent) parent.add(m);
  return m;
}
const line = (k, fn) => { const prev = LINE; LINE = k; const r = fn(); LINE = prev; return r; };
const sphere = (r = 1, w = 40, h = 28) => new THREE.SphereGeometry(r, w, h);
const lathe = (pts, seg = 56, phiStart = 0, phiLen = TAU) => {
  const p = pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts; // de abajo arriba → normales hacia fuera
  return new THREE.LatheGeometry(p.map(([x, y]) => new THREE.Vector2(x, y)), seg, phiStart, phiLen);
};
const group = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.set(...pos); if (parent) parent.add(g); return g; };
function tube(points, radius, material, parent, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve, seg, radius, 10, false), material, parent);
}

// ---------- Construcción del personaje ----------
const HEAD_R = 1.15;
const HIP_Y = 2.52, KNEE_L = 0.79, SHIN_L = 0.96, LEG_X = 0.485, ANKLE_Y = HIP_Y - KNEE_L - SHIN_L; // 0.77
const R = {}; // referencias a los nodos del rig

function buildCharacter(tex) {
  materials();
  const root = group(null);
  R.root = root;

  // ----- Caderas -----
  const hips = group(root, [0, HIP_Y, 0]); R.hips = hips;
  line('pelvis', () => mesh(sphere(1), M.pants, hips, [0, 0.12, 0], [0.93, 0.6, 0.62]));

  // Faldones de la chaqueta: dos mitades con abertura en V delante (como en el dibujo) y una pequeña atrás
  R.skirt = [];
  [1, -1].forEach((side) => {
    const g = group(hips, [0, 0.55, 0]);
    const NU = 28, NV = 10, pos = [], idx = [];
    const rad = (v) => 0.985 + 0.15 * v, yy = (v) => 0.06 - 0.8 * v;
    const front = (v) => 0.05 + 0.4 * Math.pow(v, 1.25), back = (v) => Math.PI - 0.03 - 0.07 * v;
    const P = (u, v) => { const a = front(v) + (back(v) - front(v)) * u; return [side * rad(v) * Math.sin(a), yy(v), rad(v) * Math.cos(a) * 0.7]; };
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) pos.push(...P(i / NU, j / NV));
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const p0 = j * (NU + 1) + i, p1 = p0 + 1, p2 = p0 + NU + 1, p3 = p2 + 1;
      if (side > 0) idx.push(p0, p2, p1, p1, p2, p3); else idx.push(p0, p1, p2, p1, p3, p2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    mesh(geo, M.jacket2, g);
    line('none', () => {  // ribete azul claro: canto delantero curvo y borde inferior
      const edge = [], hem = [];
      for (let j = 0; j <= 10; j++) edge.push(P(0, j / 10));
      for (let i = 0; i <= 24; i++) hem.push(P(i / 24, 1));
      tube(edge, 0.06, M.light, g, 20); tube(hem, 0.06, M.light, g, 40);
    });
    R.skirt.push({ g, side });
  });

  // ----- Torso -----
  const spine = group(hips, [0, 0.65, 0]); R.spine = spine; // cintura
  const tshape = group(spine); tshape.scale.set(1, 1, 0.68);
  line('torso', () => mesh(lathe([[0.0, 2.02], [0.42, 2.0], [0.78, 1.9], [0.95, 1.7], [1.0, 1.4], [0.985, 0.4], [0.975, -0.14], [0.0, -0.14]]), M.jacket, tshape));
  mesh(new THREE.CylinderGeometry(1.01, 1.005, 0.36, 56), M.band, tshape, [0, 0.09, 0]);               // cinturón
  mesh(new THREE.TorusGeometry(0.5, 0.08, 12, 40), M.light, spine, [0, 1.98, 0], [1, 1, 1], [Math.PI / 2, 0, 0]); // cuello
  mesh(sphere(1), M.light, spine, [0, 0.1, 0.69], [0.32, 0.21, 0.09]);                                 // hebilla
  line('none', () => mesh(sphere(1), M.light2, spine, [-0.04, 0.13, 0.75], [0.17, 0.09, 0.04]));
  // Botones y cordones del pecho
  const chestZ = (x, y) => 0.68 * Math.sqrt(Math.max(0.0, (y > 1.4 ? 1.0 - (y - 1.4) * 0.17 : 0.99) ** 2 - x * x));
  [1.5, 1.24, 0.97, 0.7, 0.44].forEach((y, i) => {
    const bx = 0.67 - i * 0.02;
    [-1, 1].forEach((s) => mesh(sphere(0.1, 20, 14), M.light, spine, [s * bx, y, chestZ(bx, y) + 0.03], [1, 1, 0.6]));
    if (i > 0) line('none', () => {
      const pts = [];
      for (let k = 0; k <= 12; k++) { const x = -bx + 0.1 + ((2 * bx - 0.2) * k) / 12; pts.push([x, y + 0.13, chestZ(x, y) + 0.012]); }
      tube(pts, 0.032, M.light, spine, 24);
    });
  });

  // Charreteras con flecos (pivotan en el borde interior para aletear)
  R.epaulet = [];
  [-1, 1].forEach((s) => {
    const g = group(spine, [s * 0.78, 1.9, 0]);
    mesh(sphere(1, 28, 16), M.light, g, [s * 0.36, -0.01, 0], [0.47, 0.1, 0.43]);
    for (let i = 0; i < 9; i++) {
      const a = (-100 + (200 * i) / 8) * D2R; // de delante a atrás, por el lado de fuera
      mesh(new THREE.CapsuleGeometry(0.07, 0.32, 4, 10), M.light, g, [s * (0.36 + 0.4 * Math.cos(a)), -0.25, 0.38 * Math.sin(a)], null, [0, 0, s * 0.2]);
    }
    R.epaulet.push({ g, s, base: -s * 0.2 });
  });

  // ----- Brazos -----
  R.arm = {};
  [['L', -1], ['R', 1]].forEach(([k, s]) => {
    const sh = group(spine, [s * 1.27, 1.48, 0]); sh.rotation.order = 'ZXY';
    const el = group(sh, [0, -0.98, 0]); el.rotation.order = 'ZXY';
    line('arm' + k, () => {
      mesh(new THREE.CapsuleGeometry(0.31, 0.98, 8, 20), M.jacket, sh, [0, -0.49, 0]);
      mesh(new THREE.CapsuleGeometry(0.3, 0.72, 8, 20), M.jacket, el, [0, -0.36, 0]);
    });
    mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.27, 28), M.light, el, [0, -0.74, 0]);               // puño
    const hand = group(el, [0, -1.12, 0]);
    line('hand' + k, () => {
      mesh(sphere(0.33, 28, 20), M.skin, hand, [0, 0, 0], [1, 1.05, 0.9]);
      mesh(sphere(0.12, 16, 12), M.skin, hand, [-s * 0.2, 0.08, 0.2], [1, 1.25, 1]);                   // pulgar
    });
    R.arm[k] = { sh, el, hand, s };
  });

  // ----- Cabeza -----
  const neck = group(spine, [0, 1.98, 0]); R.neck = neck;
  const head = group(neck, [0, 1.07, 0]); R.head = head;
  line('head', () => mesh(sphere(HEAD_R, 56, 40), M.skin, head));
  // posición sobre la esfera de la cabeza (giro lateral y vertical en grados)
  const onHead = (yaw, pitch, r = HEAD_R) => {
    const a = yaw * D2R, b = pitch * D2R;
    return new THREE.Vector3(r * Math.sin(a) * Math.cos(b), r * Math.sin(b), r * Math.cos(a) * Math.cos(b));
  };
  const faceNode = (yaw, pitch, r) => { const g = group(head); g.position.copy(onHead(yaw, pitch, r)); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.position.clone().normalize()); return g; };

  // Ojos (abierto / arco feliz / arco cerrado), cejas y mejillas: detalles sin contorno
  R.eye = {};
  line('none', () => {
    [['L', -1], ['R', 1]].forEach(([k, s]) => {
      const g = faceNode(s * 23, 2, HEAD_R - 0.005);
      const open = group(g);
      mesh(sphere(1, 24, 16), M.eye, open, [0, 0, 0], [0.09, 0.13, 0.045]);
      mesh(sphere(0.032, 10, 8), M.shine, open, [-0.028, 0.05, 0.04]);
      const happy = mesh(new THREE.TorusGeometry(0.12, 0.032, 8, 20, Math.PI), M.eye, g, [0, -0.04, 0.01]);
      const shut = mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 20, Math.PI * 0.8), M.eye, g, [0, 0.07, 0.01], [1, 0.55, 1], [0, 0, Math.PI + Math.PI * 0.1]);
      R.eye[k] = { open, happy, shut };
      const bg = faceNode(s * 23, 21, HEAD_R + 0.005);
      mesh(new THREE.TorusGeometry(0.17, 0.032, 8, 20, Math.PI * 0.62), M.brow, bg, [0, -0.13, 0], [1, 0.8, 1], [0, 0, Math.PI * 0.19 + s * 0.12]);
      R.eye[k].brow = bg;
      const cg = faceNode(s * 43, -10, HEAD_R - 0.02);
      mesh(sphere(1, 24, 16), M.cheek, cg, [0, 0, 0], [0.22, 0.2, 0.05]);
    });
    // Boca (queda bajo el bigote)
    R.mouth = mesh(sphere(1, 20, 14), M.mouth, head, [0, -0.72, 0.9], [0.2, 0.12, 0.1]);
  });
  mesh(sphere(0.26, 28, 20), M.nose, head, [0, -0.07, HEAD_R + 0.1]);                                   // nariz
  // Bigote: dos lóbulos que envuelven la cara, con la punta rizada hacia arriba
  [-1, 1].forEach((s) => line('must' + s, () => {
    const g = faceNode(s * 22, -23, HEAD_R + 0.06);
    mesh(sphere(1, 28, 18), M.white, g, [0, 0, 0], [0.54, 0.27, 0.2], [0, 0, s * 0.1]);
    const tip = faceNode(s * 50, -17, HEAD_R + 0.03);
    mesh(sphere(1, 20, 14), M.white, tip, [0, 0, 0], [0.26, 0.21, 0.14], [0, 0, s * 0.55]);
    const tip2 = faceNode(s * 59, -9, HEAD_R + 0.015);
    mesh(sphere(1, 16, 12), M.white, tip2, [0, 0, 0], [0.13, 0.16, 0.1], [0, 0, s * 0.3]);
  }));
  // Barba (péndulo con física)
  const beard = group(head, [0, -0.8, 0.8]); R.beard = beard;
  line('beard', () => mesh(lathe([[0.0, -1.34], [0.1, -1.12], [0.3, -0.62], [0.45, -0.18], [0.49, 0.06], [0.36, 0.22], [0.0, 0.27]], 36), M.white, beard, [0, 0, 0], [1, 1, 0.52]));
  // Pelo: melena blanca redondeada que cubre nuca y lados, con mechones hacia fuera (abierta por delante)
  line('hair', () => {
    const hair = group(head); hair.scale.set(1, 1, 0.86);
    mesh(lathe([[1.25, 0.52], [1.36, 0.18], [1.48, -0.25], [1.58, -0.6], [1.58, -0.85], [1.44, -1.03], [1.1, -1.1], [0.7, -1.02], [0.4, -0.85]], 56, 76 * D2R, 208 * D2R), M.white2, hair);
    [-1, 1].forEach((s) => {
      mesh(sphere(1, 28, 18), M.white, head, [s * 1.3, -0.4, 0.14], [0.4, 0.64, 0.42], [0, 0, s * 0.42]);
      mesh(new THREE.ConeGeometry(0.26, 0.7, 18), M.white, head, [s * 1.62, -0.86, 0.1], [1, 1, 0.8], [0, 0, -s * (Math.PI / 2 + 0.15)]);
      mesh(new THREE.ConeGeometry(0.2, 0.5, 14), M.white, head, [s * 1.1, -1.02, -0.75], [1, 1, 0.8], [-0.5, 0, -s * (Math.PI / 2 + 0.4)]);
    });
  });
  line('head', () => [-1, 1].forEach((s) => mesh(sphere(0.2, 16, 12), M.skin, head, [s * 1.1, -0.02, 0.32], [0.6, 1, 0.8]))); // orejas
  // Sombrero (con retraso propio al moverse la cabeza)
  const hat = group(head, [0, 0.43, 0]); R.hat = hat;
  const HB = 1.13, HT = 1.28, HH = 1.5;
  line('band', () => mesh(new THREE.CylinderGeometry(HB + 0.03, HB + 0.02, 0.4, 64), M.band, hat, [0, 0.2, 0]));
  line('none', () => {
    mesh(new THREE.TorusGeometry(HB + 0.03, 0.04, 10, 64), M.light, hat, [0, 0.04, 0], null, [Math.PI / 2, 0, 0]);
    mesh(new THREE.TorusGeometry(HB + 0.035, 0.045, 10, 64), M.light, hat, [0, 0.4, 0], null, [Math.PI / 2, 0, 0]);
  });
  line('hat', () => mesh(new THREE.CylinderGeometry(HT, HB, HH, 64), M.hat, hat, [0, 0.4 + HH / 2, 0]));
  if (tex.emblem) {
    const span = 124 * D2R;
    const em = new THREE.Mesh(new THREE.CylinderGeometry(HT + 0.006, HB + 0.006, HH, 64, 1, true, -span / 2, span),
      new THREE.MeshBasicMaterial({ map: tex.emblem, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    em.position.set(0, 0.4 + HH / 2, 0); em.userData.colorMat = em.material; em.userData.idMat = null; hat.add(em);
  }

  // ----- Piernas (se colocan con cinemática inversa en el espacio de la raíz) -----
  R.leg = {};
  [['L', -1], ['R', 1]].forEach(([k, s]) => {
    const thigh = group(root), shin = group(root), foot = group(root);
    line('leg' + k, () => {
      mesh(new THREE.CapsuleGeometry(0.44, KNEE_L, 8, 24), M.pants, thigh, [0, -KNEE_L / 2, 0]);
      mesh(new THREE.CapsuleGeometry(0.435, 0.3, 8, 24), M.pants, shin, [0, -0.02, 0]);
    });
    mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 32), M.light, shin, [0, -0.3, 0]);                  // vuelta de la bota
    line('boot' + k, () => {
      mesh(new THREE.CylinderGeometry(0.44, 0.44, SHIN_L - 0.5, 28), M.boot, shin, [0, -0.5 - (SHIN_L - 0.5) / 2, 0]);
      mesh(new THREE.CylinderGeometry(0.44, 0.45, 0.82, 28), M.boot, foot, [0, -0.36, 0]);
      mesh(sphere(1, 32, 20), M.boot, foot, [0, -0.47, 0.3], [0.47, 0.3, 0.74]);
      mesh(sphere(0.44, 24, 16), M.boot, foot, [0, 0, 0]);
    });
    line('none', () => mesh(sphere(1, 16, 10), M.bootShine, foot, [-s * 0.12, -0.3, 0.72], [0.15, 0.03, 0.09], [0.5, 0, s * 0.3])); // brillo
    R.leg[k] = { thigh, shin, foot, s };
  });
  return root;
}

// ======================================================================================================
// ANIMACIÓN
// ======================================================================================================
// Spline cúbica monótona (Fritsch–Carlson)
function spline(ks) {
  const n = ks.length, xs = ks.map((k) => k[0]), ys = ks.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (t) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h;
    return (2 * u ** 3 - 3 * u ** 2 + 1) * ys[i] + (u ** 3 - 2 * u ** 2 + u) * h * m[i] + (-2 * u ** 3 + 3 * u ** 2) * ys[i + 1] + (u ** 3 - u ** 2) * h * m[i + 1];
  };
}
const bump = (t, t0, t1, h) => (t > t0 && t < t1 ? h * Math.sin((Math.PI * (t - t0)) / (t1 - t0)) ** 2 : 0);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// Momentos clave: 0–1 ritmo y twist · 1–2 saludo y paso · 2–3 brazos arriba y caderas · 3–3.75 marcha ·
// 3.75–4.4 agacharse y salto con giro de 360° · 4.4–5 aterrizaje, saludo militar con guiño y vuelta al inicio
const T_JUMP0 = 3.9, T_JUMP1 = 4.36;
const K = {
  // Brazo derecho del personaje (izquierda en pantalla): elevación lateral, balanceo adelante, codo (flexión) y codo (lateral)
  aLraise: spline([[0, 7], [0.9, 7], [1.02, 0], [1.22, 166], [1.9, 166], [2.25, 171], [2.5, 157], [2.75, 171], [2.9, 162], [3.06, 12], [3.72, 9],
    [3.86, 4], [4.04, 52], [4.3, 40], [4.42, 14], [4.58, 158], [4.82, 158], [4.95, 9], [5, 7]]),
  aLswing: spline([[0, 0], [1.0, -12], [1.22, 8], [1.9, 8], [2.9, 0], [3.0, -30], [3.12, 42], [3.37, -40], [3.62, 42], [3.75, 0], [3.86, -30],
    [4.04, 25], [4.36, 10], [4.58, 14], [4.82, 14], [4.95, 0], [5, 0]]),
  aLbend: spline([[0, 8], [1.0, 30], [1.22, 12], [2.9, 10], [3.06, 80], [3.72, 80], [3.86, 50], [4.04, 75], [4.36, 60], [4.58, 20], [4.82, 20], [4.95, 10], [5, 8]]),
  aLwag: spline([[0, 0], [1.1, 0], [1.24, 18], [1.36, 44], [1.5, -8], [1.64, 44], [1.78, -8], [1.92, 32], [2.06, 14], [2.25, 22], [2.5, 4], [2.75, 22],
    [2.9, 10], [3.06, 0], [4.42, 0], [4.58, 42], [4.82, 42], [4.95, 0], [5, 0]]),
  // Brazo izquierdo del personaje (derecha en pantalla)
  aRraise: spline([[0, 7], [1.0, 12], [1.9, 12], [2.0, 0], [2.18, 166], [2.25, 157], [2.5, 171], [2.75, 157], [2.9, 162], [3.06, 12], [3.72, 9],
    [3.86, 4], [4.04, 52], [4.3, 40], [4.42, 14], [4.6, 10], [5, 7]]),
  aRswing: spline([[0, 0], [2.0, -12], [2.18, 8], [2.9, 0], [3.0, 30], [3.12, -40], [3.37, 42], [3.62, -40], [3.75, 0], [3.86, -30], [4.04, 25],
    [4.36, 10], [4.5, -6], [4.7, 4], [5, 0]]),
  aRbend: spline([[0, 8], [2.0, 30], [2.18, 12], [2.9, 10], [3.06, 80], [3.72, 80], [3.86, 50], [4.04, 75], [4.36, 60], [4.5, 20], [4.7, 12], [5, 8]]),
  aRwag: spline([[0, 0], [2.1, 0], [2.25, 4], [2.5, 22], [2.75, 4], [2.9, 10], [3.06, 0], [5, 0]]),
  // Cuerpo
  hipX: spline([[0, 0], [0.95, 0.05], [1.2, -0.05], [1.36, -0.1], [1.6, -0.12], [1.86, -0.18], [3.86, -0.18], [4.36, 0], [5, 0]]),
  crouch: spline([[0, 0], [0.9, 0], [1.0, 0.14], [1.14, 0], [1.38, 0.1], [1.5, 0], [1.88, 0.1], [2.0, 0.12], [2.14, 0], [3.7, 0], [3.86, 0.55], [3.93, 0.05],
    [4.02, 0], [4.34, 0], [4.42, 0.5], [4.58, 0.08], [4.7, 0], [5, 0]]),
  spinePitch: spline([[0, 0], [1.0, 6], [1.2, -3], [2.0, 4], [2.2, -5], [2.9, -5], [3.06, 3], [3.7, 3], [3.86, 16], [4.0, -8], [4.3, -4], [4.42, 14], [4.6, 0], [5, 0]]),
  spineRoll: spline([[0, 0], [1.0, -3], [1.22, 3], [1.9, 2], [2.1, 0], [4.5, 0], [4.62, 4], [4.85, 3], [5, 0]]),
  spineTwist: spline([[0, 0], [1.0, 6], [1.22, -14], [1.9, -12], [2.1, 0], [4.5, 0], [4.62, -8], [4.85, -6], [5, 0]]),
  headYaw: spline([[0, 0], [0.5, 9], [1.0, -6], [1.25, -24], [1.9, -18], [2.25, 14], [2.5, -14], [2.75, 14], [3.0, 0], [3.86, 0], [4.5, 0], [4.62, -10], [4.85, -8], [5, 0]]),
  headRoll: spline([[0, 0], [0.5, 6], [1.0, -6], [1.25, -9], [1.9, -6], [2.25, 8], [2.5, -8], [2.75, 8], [3.0, 0], [3.12, 5], [3.37, -5], [3.62, 5],
    [3.75, 0], [4.5, 0], [4.62, 7], [4.85, 6], [5, 0]]),
  headPitch: spline([[0, 0], [1.0, 6], [1.2, -5], [2.0, 0], [2.2, -8], [2.9, -8], [3.0, 2], [3.12, 8], [3.25, -3], [3.37, 8], [3.5, -3], [3.62, 8], [3.72, 0],
    [3.86, 14], [4.02, -14], [4.3, -6], [4.42, 12], [4.6, -4], [4.85, -3], [5, 0]]),
  squash: spline([[0, 0], [0.92, 0], [1.0, 0.04], [1.14, -0.035], [1.38, 0.03], [1.5, 0], [1.9, 0.03], [2.0, 0.035], [2.16, -0.04], [2.4, 0], [3.7, 0],
    [3.86, 0.11], [3.98, -0.11], [4.3, -0.05], [4.41, 0.13], [4.56, 0], [5, 0]]),
  mouth: spline([[0, 0], [1.1, 0], [1.25, 0.8], [1.6, 1], [2.0, 0.7], [2.5, 1], [3.0, 0.7], [3.5, 0.9], [3.75, 0.5], [3.9, 1.2], [4.3, 1.2], [4.45, 0.3],
    [4.6, 0.6], [4.85, 0.6], [4.97, 0], [5, 0]]),
  // Envolventes
  groove: spline([[0, 0], [0.15, 0], [0.55, 0.14], [2.9, 0.16], [3.0, 0.1], [3.66, 0.1], [3.74, 0], [4.7, 0], [4.92, 0.05], [5, 0]]),
  twist1: spline([[0, 0], [0.2, 0], [0.5, 16], [0.95, 10], [1.1, 0], [5, 0]]),
  twist2: spline([[0, 0], [2.0, 0], [2.16, 20], [2.86, 20], [3.02, 0], [5, 0]]),
  sway1: spline([[0, 0], [0.2, 0], [0.5, 0.12], [1.0, 0.06], [1.1, 0], [5, 0]]),
  sway2: spline([[0, 0], [2.0, 0], [2.16, 0.2], [2.86, 0.2], [3.02, 0], [5, 0]]),
  yaw: spline([[0, 0], [T_JUMP0 - 0.04, 0], [T_JUMP1 + 0.02, 360], [5, 360]]),
  footLx: spline([[0, 0], [1.05, 0], [1.36, -0.18], [T_JUMP0, -0.18], [T_JUMP1, 0], [5, 0]]),
  footRx: spline([[0, 0], [1.52, 0], [1.86, -0.18], [T_JUMP0, -0.18], [T_JUMP1, 0], [5, 0]]),
};
// Canales con resorte: [frecuencia Hz, amortiguación]. Menos de 1 → overshoot
const SPRING = {
  aLraise: [2.9, 0.55], aLswing: [3.2, 0.5], aLbend: [4, 0.5], aLwag: [4.4, 0.45],
  aRraise: [2.9, 0.55], aRswing: [3.2, 0.5], aRbend: [4, 0.5], aRwag: [4.4, 0.45],
  hipX: [3, 0.8], spinePitch: [3, 0.5], spineRoll: [2.8, 0.5], spineTwist: [2.8, 0.5],
  headYaw: [3.2, 0.48], headRoll: [3.2, 0.45], headPitch: [3.4, 0.45], squash: [4.2, 0.34], mouth: [6, 0.6],
};
// Física secundaria: [Hz, amortiguación, mínimo, máximo]
const SECP = {
  beardX: [2.2, 0.26, -75, 7], beardZ: [2.2, 0.26, -22, 22],
  hatX: [5, 0.3, -7, 7], hatZ: [5, 0.3, -7, 7], hatY: [6, 0.35, 0, 0.3],
  epL: [4.5, 0.3, -30, 14], epR: [4.5, 0.3, -30, 14], skirt: [3.4, 0.3, -4, 34],
};

// Señales derivadas (sin resorte) comunes a la pose y a la simulación
function base(t) {
  const beat = 0.5 * (1 + Math.cos(TAU * 2 * t));
  const jumpU = (t - T_JUMP0) / (T_JUMP1 - T_JUMP0);
  const hop = jumpU > 0 && jumpU < 1 ? 4 * 0.95 * jumpU * (1 - jumpU) : 0;
  const twist = K.twist1(t) * Math.sin(TAU * t) + K.twist2(t) * Math.sin(TAU * 2 * (t - 2));
  const sway = K.sway1(t) * Math.sin(TAU * t - 0.5) + K.sway2(t) * Math.sin(TAU * 2 * (t - 2) - 0.6);
  const drop = K.groove(t) * beat + K.crouch(t);
  return { beat, hop, twist, sway, drop, yaw: K.yaw(t) };
}

const SIM_DT = 1 / 600, N = Math.round(DUR / SIM_DT);
let SIM = null, VIEW = 0;
function simulate() {
  const ch = Object.keys(SPRING), sc = Object.keys(SECP);
  const st = {}; ch.forEach((c) => (st[c] = { x: K[c](0), v: 0 }));
  const ss = {}; sc.forEach((c) => (ss[c] = { x: 0, v: 0 }));
  const out = { t: {}, s: {} };
  ch.forEach((c) => (out.t[c] = new Float32Array(N + 1))); sc.forEach((c) => (out.s[c] = new Float32Array(N + 1)));
  const hist = [];
  for (let cyc = 0; cyc < 3; cyc++) {
    for (let i = 0; i < N; i++) {
      const t = i * SIM_DT;
      for (const c of ch) {
        const [hz, z] = SPRING[c], w = TAU * hz, s = st[c];
        s.v += (w * w * (K[c](t) - s.x) - 2 * z * w * s.v) * SIM_DT; s.x += s.v * SIM_DT;
      }
      // Señales del cuerpo que arrastran al secundario
      const b = base(t);
      const cur = {
        lat: st.hipX.x + b.sway, vert: b.hop - b.drop,
        roll: st.spineRoll.x + st.headRoll.x - b.sway * 40, pitch: st.spinePitch.x + st.headPitch.x,
        yaw: b.yaw + 360 * cyc + b.twist * 0.3 + st.spineTwist.x + st.headYaw.x, aL: st.aLraise.x, aR: st.aRraise.x, twist: b.twist,
      };
      hist.push(cur); if (hist.length > 3) hist.shift();
      if (hist.length === 3) {
        const acc = (k) => (hist[2][k] - 2 * hist[1][k] + hist[0][k]) / (SIM_DT * SIM_DT);
        const vel = (k) => (hist[2][k] - hist[1][k]) / SIM_DT;
        const yawRate = vel('yaw') * D2R, cent = yawRate * yawRate; // fuerza centrífuga del giro
        const drive = {
          beardX: -acc('vert') * 9 - acc('pitch') * 0.7 - cent * 2.2,
          beardZ: acc('lat') * 28 - acc('roll') * 0.8,
          hatX: -acc('pitch') * 0.16 + acc('vert') * 0.5, hatZ: -acc('roll') * 0.16 + acc('lat') * 3, hatY: -acc('vert') * 0.012,
          epL: -acc('vert') * 3 - cent * 1.1 - Math.abs(vel('aL')) * 0.9, epR: -acc('vert') * 3 - cent * 1.1 - Math.abs(vel('aR')) * 0.9,
          skirt: cent * 3.4 - acc('vert') * 2.4 + Math.abs(vel('twist')) * 1.6,
        };
        for (const c of sc) {
          const [hz, z, lo, hi] = SECP[c], w = TAU * hz, s = ss[c];
          s.v += (-w * w * s.x - 2 * z * w * s.v + drive[c]) * SIM_DT; s.x += s.v * SIM_DT;
          if (s.x < lo) { s.x = lo; s.v *= -0.25; } else if (s.x > hi) { s.x = hi; s.v *= -0.25; }
        }
      }
      if (cyc === 2) { ch.forEach((c) => (out.t[c][i] = st[c].x)); sc.forEach((c) => (out.s[c][i] = ss[c].x)); }
    }
  }
  ch.forEach((c) => (out.t[c][N] = out.t[c][0])); sc.forEach((c) => (out.s[c][N] = out.s[c][0]));
  return out;
}
function samp(arr, t) {
  const x = (((t % DUR) + DUR) % DUR) / SIM_DT, i = Math.floor(x), u = x - i;
  return arr[i] * (1 - u) + arr[Math.min(i + 1, N)] * u;
}

// ---------- Aplicar la pose al rig ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0);
function applyPose(t) {
  if (!SIM) SIM = simulate();
  const v = {}; for (const c of Object.keys(SPRING)) v[c] = samp(SIM.t[c], t);
  const s = {}; for (const c of Object.keys(SECP)) s[c] = samp(SIM.s[c], t);
  const b = base(t);

  // Raíz: salto, giro y squash & stretch de todo el cuerpo
  const sq = clamp(v.squash + 0.015 * (K.groove(t) * b.beat) / 0.16, -0.14, 0.15), sy = 1 - sq, sx = 1 / Math.sqrt(sy);
  R.root.position.set(0, b.hop, 0);
  R.root.rotation.set(0, (b.yaw + VIEW) * D2R, 0);
  R.root.scale.set(sx, sy, sx);

  // Caderas
  R.shadow = { x: v.hipX + b.sway * 0.5, k: 1 / (1 + b.hop * 0.9) };
  R.hips.position.set(v.hipX + b.sway, HIP_Y - b.drop, 0);
  R.hips.rotation.set(0, b.twist * D2R, -b.sway * 40 * D2R);
  // Torso (contra-rotación del twist para que el pecho mire más a cámara)
  R.spine.rotation.set(v.spinePitch * D2R, (v.spineTwist - b.twist * 0.75) * D2R, (v.spineRoll + b.sway * 55) * D2R);
  // Cabeza
  R.neck.rotation.set(v.headPitch * D2R, (v.headYaw - b.twist * 0.25) * D2R, v.headRoll * D2R);
  R.hat.rotation.set(s.hatX * D2R, 0, s.hatZ * D2R); R.hat.position.y = 0.43 + s.hatY;
  R.beard.rotation.set(0.04 + s.beardX * D2R, 0, s.beardZ * D2R);
  R.epaulet.forEach((e, i) => { e.g.rotation.z = e.base - e.s * (i === 0 ? s.epL : s.epR) * D2R; });
  R.skirt.forEach((k) => { k.g.rotation.z = k.side * s.skirt * D2R * 0.55; });

  // Brazos (los del twist acompañan con balanceo contrario)
  const swingGroove = b.twist * 1.1;
  const arms = { L: [v.aLraise, v.aLswing + swingGroove, v.aLbend, v.aLwag], R: [v.aRraise, v.aRswing - swingGroove, v.aRbend, v.aRwag] };
  for (const k of ['L', 'R']) {
    const a = R.arm[k], [raise, swing, bend, wag] = arms[k];
    a.sh.rotation.set(-swing * D2R, 0, a.s * raise * D2R);
    a.el.rotation.set(-bend * D2R, 0, a.s * wag * D2R);
  }

  // Pies (objetivos en el espacio de la raíz) y piernas con cinemática inversa
  const air = b.hop > 0 ? Math.sin(Math.PI * clamp((t - T_JUMP0) / (T_JUMP1 - T_JUMP0), 0, 1)) : 0;
  const feet = {
    L: { x: -LEG_X + K.footLx(t), lift: bump(t, 1.05, 1.36, 0.4) + bump(t, 3.25, 3.5, 0.95) + air * 0.55, fwd: bump(t, 3.25, 3.5, 0.4) + air * 0.1 },
    R: { x: LEG_X + K.footRx(t), lift: bump(t, 1.52, 1.86, 0.34) + bump(t, 3.0, 3.25, 0.95) + bump(t, 3.5, 3.75, 0.95) + air * 0.4, fwd: bump(t, 3.0, 3.25, 0.4) + bump(t, 3.5, 3.75, 0.4) + air * 0.25 },
  };
  R.root.updateMatrixWorld(true);
  const inv = R.root.matrixWorld.clone().invert();
  for (const k of ['L', 'R']) {
    const lg = R.leg[k], f = feet[k];
    const hip = V(lg.s * LEG_X, 0, 0).applyMatrix4(R.hips.matrixWorld).applyMatrix4(inv);
    const ankle = V(f.x, ANKLE_Y + f.lift, f.fwd);
    const dir = ankle.clone().sub(hip); let d = dir.length(); dir.normalize();
    d = clamp(d, 0.2, KNEE_L + SHIN_L - 0.002);
    const ang = Math.acos(clamp((KNEE_L ** 2 + d ** 2 - SHIN_L ** 2) / (2 * KNEE_L * d), -1, 1));
    const pole = V(lg.s * 0.28, 0, 1).normalize();
    const perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const knee = hip.clone().add(dir.clone().multiplyScalar(KNEE_L * Math.cos(ang))).add(perp.multiplyScalar(KNEE_L * Math.sin(ang)));
    const foot = hip.clone().add(dir.clone().multiplyScalar(d)); // tobillo alcanzable
    lg.thigh.position.copy(hip); lg.thigh.quaternion.setFromUnitVectors(DOWN, knee.clone().sub(hip).normalize());
    lg.shin.position.copy(knee); lg.shin.quaternion.setFromUnitVectors(DOWN, foot.clone().sub(knee).normalize());
    lg.foot.position.copy(foot);
    lg.foot.rotation.set(clamp(f.lift * 0.75, 0, 0.75), lg.s * 0.2, 0, 'YXZ');
  }

  // Cara
  const lid = (t0, t1, t2) => (t < t0 || t > t2 ? 0 : t < t1 ? smooth((t - t0) / (t1 - t0)) : 1 - smooth((t - t1) / (t2 - t1)));
  const happy = (t >= 0.98 && t < 3.8);
  const blink = Math.max(lid(0.3, 0.36, 0.44), lid(0.9, 0.98, 1.06), lid(3.74, 3.8, 3.87));
  const wink = t >= 4.6 && t <= 4.9 ? Math.min(smooth((t - 4.6) / 0.06), 1 - smooth((t - 4.84) / 0.06)) : 0;
  const surprised = smooth((t - 3.86) / 0.08) * (1 - smooth((t - 4.4) / 0.08)); // ojos bien abiertos en el salto
  [['L', blink], ['R', Math.max(blink, wink)]].forEach(([k, l]) => {
    const e = R.eye[k], hp = happy && l < 0.5;
    e.happy.visible = hp; e.shut.visible = !hp && l > 0.9; e.open.visible = !hp && l <= 0.9;
    e.open.scale.set(1 + surprised * 0.15, Math.max(0.08, 1 - l) * (1 + surprised * 0.25), 1);
    e.brow.position.y = (HEAD_R + 0.005) * Math.sin(21 * D2R) + (hp ? 0.05 : 0) + surprised * 0.12 - (k === 'R' ? wink * 0.06 : 0);
  });
  const mo = clamp(v.mouth * (happy ? 0.7 + 0.3 * b.beat : 1), 0, 1.3);
  R.mouth.scale.set(0.16 + 0.05 * mo, 0.03 + 0.2 * mo, 0.1);
  R.mouth.position.y = -0.7 - 0.12 * mo;
  R.mouth.visible = mo > 0.04;
}

// ======================================================================================================
// ESCENA Y RENDER (estilo ilustración: color plano suave + línea de contorno)
// ======================================================================================================
let renderer, scene, camera, gifts, charRoot, shadowPlane, rtColor, rtId, postScene, postCam, postMat;
export async function init(canvas, width, height, opts = {}) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();

  // Cámara fija, con algo de perspectiva
  camera = new THREE.PerspectiveCamera(18.2, width / height, 1, 200);
  camera.position.set(0, 6.3, 46);
  camera.lookAt(0, 5.5, 0);

  // Una sola luz (arriba a la izquierda, como en el dibujo); el sombreado lo da la rampa suave
  const key = new THREE.DirectionalLight(0xffffff, Math.PI);
  key.position.set(-7, 11, 14); scene.add(key);

  // Sombra del suelo: elipse suave bajo los pies, como en el dibujo (se encoge cuando salta)
  const sc = document.createElement('canvas'); sc.width = sc.height = 256;
  const cx = sc.getContext('2d'), gr = cx.createRadialGradient(128, 128, 20, 128, 128, 126);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 256, 256);
  shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = 0.01; shadowPlane.userData.idMat = null; scene.add(shadowPlane);

  const tex = {};
  if (opts.emblemUrl) {
    tex.emblem = await new THREE.TextureLoader().loadAsync(opts.emblemUrl);
    tex.emblem.colorSpace = THREE.SRGBColorSpace; tex.emblem.anisotropy = 8;
  }
  charRoot = buildCharacter(tex);
  scene.add(charRoot);
  gifts = buildGifts(); gifts.position.y = -1.95; scene.add(gifts);

  // Pasada de color (con antialias) + pasada de identificadores de pieza → línea de contorno
  rtColor = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType });
  rtId = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rtColor.texture }, tId: { value: rtId.texture },
      px: { value: new THREE.Vector2(1 / width, 1 / height) }, radius: { value: height * (opts.line ?? 0.0017) },
      lineColor: { value: new THREE.Color(COL.line) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tColor, tId; uniform vec2 px; uniform float radius; uniform vec3 lineColor; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tColor, vUv);
        vec3 col = c.a > 0.001 ? c.rgb / c.a : vec3(0.0);
        vec4 idc = texture2D(tId, vUv);
        float diff = 0.0;
        for (int i = 0; i < 24; i++) {
          float a = 6.2831853 * (float(i) + 0.5) / 12.0;
          float r = i < 12 ? radius : radius * 0.55;
          vec4 s = texture2D(tId, vUv + vec2(cos(a), sin(a)) * r * px);
          diff += step(0.03, distance(idc, s));
        }
        float edge = smoothstep(0.06, 0.32, diff / 24.0);
        gl_FragColor = vec4(mix(col, lineColor, edge), max(c.a, edge));
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }`,
    depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending,
  });
  postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
  SIM = simulate();
  return true;
}

// Regalos 3D para la versión con fondo (capa aparte)
function buildGifts() {
  const g = new THREE.Group();
  const box = (x, z, w, h, d, body, ribbon, ry) => {
    const b = group(g, [x, 0, z]); b.rotation.y = ry;
    const mb = mat(body), mr = mat(ribbon);
    line('gift' + x, () => {
      mesh(new THREE.BoxGeometry(w, h, d), mb, b, [0, h / 2, 0]);
    });
    mesh(new THREE.BoxGeometry(w * 1.07, h * 0.24, d * 1.07), mb, b, [0, h * 0.92, 0]);
    line('ribbon' + x, () => {
      mesh(new THREE.BoxGeometry(w * 0.17, h * 1.07, d * 1.09), mr, b, [0, h * 0.53, 0]);
      mesh(new THREE.BoxGeometry(w * 1.09, h * 1.07, d * 0.17), mr, b, [0, h * 0.53, 0]);
    });
    [-1, 1].forEach((s) => mesh(new THREE.TorusGeometry(w * 0.17, w * 0.06, 10, 24), mr, b, [s * w * 0.18, h * 1.08 + w * 0.1, 0], [1, 0.75, 1], [0, 0, s * 0.5]));
    mesh(sphere(w * 0.08, 14, 10), mr, b, [0, h * 1.06 + w * 0.05, 0]);
  };
  box(-1.75, 4.2, 1.5, 1.35, 1.5, 0xe23a2c, 0xffcf3a, 0.35);
  box(1.8, 3.9, 1.55, 1.7, 1.55, 0x1f9a4a, 0xffcf3a, -0.3);
  box(0.1, 5.6, 1.25, 0.95, 1.25, 0xffcf3a, 0xe23a2c, 0.1);
  return g;
}

// capa: 'personaje' (soldado + sombra), 'regalos' (solo regalos), 'todo'
export function render(t, capa = 'personaje') {
  applyPose(((t % DUR) + DUR) % DUR);
  charRoot.visible = capa !== 'regalos';
  shadowPlane.visible = capa !== 'regalos';
  gifts.visible = capa !== 'personaje';
  shadowPlane.position.x = R.shadow.x; shadowPlane.scale.set(4.4 * R.shadow.k, 1.9 * R.shadow.k, 1); shadowPlane.material.opacity = 0.3 * R.shadow.k;
  // 1) color
  renderer.setRenderTarget(rtColor); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, camera);
  // 2) identificadores de pieza
  const hidden = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.idMat) o.material = o.userData.idMat;
    else if (o.visible) { o.visible = false; hidden.push(o); }
  });
  renderer.setRenderTarget(rtId); renderer.clear();
  renderer.render(scene, camera);
  scene.traverse((o) => { if (o.isMesh && o.userData.colorMat) o.material = o.userData.colorMat; });
  hidden.forEach((o) => { o.visible = true; });
  // 3) composición con la línea
  renderer.setRenderTarget(null); renderer.clear();
  renderer.render(postScene, postCam);
}
export function setView(yawDeg) { VIEW = -yawDeg; } // gira al personaje (la luz y la cámara quedan fijas)
