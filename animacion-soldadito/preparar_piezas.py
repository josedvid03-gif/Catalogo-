"""Corta al soldadito de la hoja de personaje original en piezas animables.

Uso: python3 preparar_piezas.py <hoja_personaje.webp|png> <carpeta_salida>

Toma la vista de FRENTE grande (columna izquierda de la hoja), quita el fondo blanco,
la amplía x4 y la separa en: cabeza, torso, brazo/antebrazo (x2), muslo/pierna (x2).
Las zonas que en el dibujo original quedan tapadas (bajo la barba, bajo los brazos,
la parte alta del pantalón bajo el faldón, la mano detrás del faldón) se rellenan con
los colores del propio dibujo. Además genera una silueta oscura por pieza para que las
articulaciones conserven el contorno al moverse.

Coordenadas "R": píxeles de la hoja original, con el origen en (0, 20).
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

K = 4                      # factor de ampliación
CROP = (0, 20, 372, 920)   # vista de frente dentro de la hoja
src_path, out_dir = sys.argv[1], Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

src = Image.open(src_path).convert('RGB').crop(CROP)
big = np.array(src.resize((src.width * K, src.height * K), Image.LANCZOS))
H, W = big.shape[:2]

# ---------- 1. Fondo fuera ----------
b16 = big.astype(np.int16)
light = (b16.min(-1) > 200) & ((b16.max(-1) - b16.min(-1)) < 30)
lab, _ = ndi.label(light)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
fg = ~np.isin(lab, list(border))
lab2, n2 = ndi.label(fg)
sizes = ndi.sum(fg, lab2, range(1, n2 + 1))
keep = np.zeros(n2 + 1, bool)
keep[1:] = sizes > 2000
fg = ndi.binary_fill_holes(keep[lab2])

yy, xx = np.mgrid[0:H, 0:W] / K  # coordenadas R de cada píxel


def sample(x, y, r=2):
    """Color medio del dibujo alrededor de (x, y) en coordenadas R."""
    px, py = int(x * K), int(y * K)
    return big[py - r * K:py + r * K, px - r * K:px + r * K].reshape(-1, 3).mean(0).astype(int)


JACKET = tuple(int(c) for c in sample(66, 480))
PANTS = tuple(int(c) for c in sample(146, 672))
SKIN = tuple(int(c) for c in sample(50, 625))
BRAID = tuple(int(c) for c in sample(195, 515, 1))
OUTLINE = (14, 24, 48)


def poly_mask(points):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array([(int(x * K), int(y * K)) for x, y in points], np.int32)], 1)
    return m.astype(bool)


def circle(m, cx, cy, r):
    cv2.circle(m, (int(cx * K), int(cy * K)), int(r * K), 1, -1)


# ---------- 2. Máscaras de cada zona ----------
HEAD_CUT = 364
# Barba: zona blanca bajo la línea de corte de la cabeza (más su contorno)
whitish = (b16.min(-1) > 205)
beard_zone = (xx > 140) & (xx < 252) & (yy >= HEAD_CUT - 6) & (yy < 478)
blab, _ = ndi.label(whitish & beard_zone)
ids = np.unique(blab[(yy > 380) & (yy < 400) & (np.abs(xx - 195) < 8)])
beard = np.isin(blab, ids[ids > 0])
beard = ndi.binary_dilation(beard, iterations=int(3.5 * K)) & beard_zone
head_m = fg & ((yy < HEAD_CUT) | beard)

# Límite brazo/torso (sigue el contorno del faldón, que tapa parte de la mano)
arm_L_poly = [(0, 437), (97, 437), (97, 598), (91, 606), (82, 632), (88, 642), (93, 650), (93, 700), (0, 700)]
arm_R_poly = [(372, 437), (288, 437), (288, 598), (295, 606), (303, 632), (298, 642), (292, 650), (292, 700), (372, 700)]
armL_m = fg & poly_mask(arm_L_poly) & ~head_m
armR_m = fg & poly_mask(arm_R_poly) & ~head_m

LEG_CUT = 642
legs_zone = (yy >= LEG_CUT) & ~poly_mask(arm_L_poly) & ~poly_mask(arm_R_poly)
torso_m = fg & ~head_m & ~armL_m & ~armR_m & ~legs_zone & (yy >= HEAD_CUT - 10)
legs_m = fg & legs_zone


# ---------- 3. Utilidades para componer piezas ----------
def layer(mask):
    """RGBA con los píxeles originales dentro de la máscara."""
    a = (mask * 255).astype(np.uint8)
    return np.dstack([big, a])


def paint_under(rgba, fill_mask, color):
    """Pinta 'color' donde la pieza está vacía y fill_mask es verdadero."""
    m = fill_mask & (rgba[..., 3] < 255)
    alpha = rgba[..., 3:4].astype(float) / 255
    base = np.zeros_like(rgba)
    base[m] = (*color, 255)
    out = rgba.astype(float)
    out[..., :3] = rgba[..., :3] * alpha + base[..., :3] * (1 - alpha)
    out[..., 3] = np.maximum(rgba[..., 3], base[..., 3])
    return out.astype(np.uint8)


def save(name, rgba, pieces, pad=6):
    a = rgba[..., 3]
    ys, xs = np.nonzero(a > 0)
    y0, y1 = max(ys.min() - pad * K, 0), min(ys.max() + pad * K, H - 1)
    x0, x1 = max(xs.min() - pad * K, 0), min(xs.max() + pad * K, W - 1)
    crop = rgba[y0:y1 + 1, x0:x1 + 1].copy()
    # Bordes suaves
    crop[..., 3] = cv2.GaussianBlur(crop[..., 3], (3, 3), 0)
    Image.fromarray(crop).save(out_dir / f'{name}.png', optimize=True)
    # Silueta de contorno (para las articulaciones)
    sil_a = cv2.dilate((crop[..., 3] > 100).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(4.5 * K), int(4.5 * K))))
    sil = np.dstack([np.full_like(sil_a, OUTLINE[0]), np.full_like(sil_a, OUTLINE[1]), np.full_like(sil_a, OUTLINE[2]),
                     cv2.GaussianBlur(sil_a * 255, (3, 3), 0)])
    Image.fromarray(sil).save(out_dir / f'{name}_sil.png', optimize=True)
    pieces[name] = {'x': x0 / K, 'y': y0 / K, 'w': (x1 - x0 + 1) / K, 'h': (y1 - y0 + 1) / K}


pieces = {}

# ---------- Cabeza ----------
# ---------- Cabeza, pelo y barba (separados para el movimiento secundario) ----------
HAIR_COL = tuple(int(c) for c in sample(40, 300, 1))
FACE_C, FACE_R = (193, 255), (124, 111)
face_ell = (((xx - FACE_C[0]) / FACE_R[0]) ** 2 + ((yy - FACE_C[1]) / FACE_R[1]) ** 2) <= 1
# Barba completa: zona blanca bajo el bigote
bzone = (xx > 144) & (xx < 248) & (yy > 337) & (yy < 478)
blab, _ = ndi.label(whitish & bzone)
ids = np.unique(blab[(yy > 390) & (yy < 410) & (np.abs(xx - 195) < 6)])
beard_full = np.isin(blab, ids[ids > 0])
beard_full = ndi.binary_dilation(beard_full, iterations=int(3.5 * K)) & bzone & fg
skin_like = ((b16[..., 0] - b16[..., 2]) > 22) & (b16.mean(-1) > 150) & head_m & (yy > 214)
skin_like = ndi.binary_opening(skin_like, iterations=K)
skin_reg = ndi.binary_dilation(ndi.binary_fill_holes(skin_like | face_ell), iterations=int(2.5 * K))
hair_m = head_m & ~face_ell & ~skin_reg & (yy > 214) & ~beard_full
hair_m = ndi.binary_opening(hair_m, iterations=K)
head_core = head_m & ~hair_m & ~beard_full
save('cabeza', layer(head_core), pieces)
for k, side in {'L': xx < 193, 'R': xx >= 193}.items():
    hm = hair_m & side
    hl = layer(hm)
    ext = ndi.binary_dilation(hm, iterations=int(9 * K)) & (face_ell | skin_reg) & side & (yy > 205) & (yy < 368)
    hl = paint_under(hl, ext, HAIR_COL)
    save(f'pelo_{k}', hl, pieces)
save('barba', layer(ndi.binary_dilation(beard_full, iterations=int(1.5 * K)) & fg & (yy > 334)), pieces)

# ---------- Torso ----------
torso = layer(torso_m)
under_beard = beard & (yy >= HEAD_CUT - 2)
torso = paint_under(torso, ndi.binary_dilation(under_beard, iterations=K) & (yy < 520), tuple(int(c) for c in sample(172, 470, 1)))
braids = np.zeros((H, W), np.uint8)
for by in (402, 432, 458, 487):   # cordones del pecho continúan bajo la barba
    cv2.line(braids, (int(150 * K), int(by * K)), (int(240 * K), int(by * K)), 1, int(4 * K))
torso[(braids > 0) & under_beard] = (*[int(c) for c in BRAID], 255)
torso[poly_mask([(150, 380), (240, 380), (240, 520), (150, 520)]) & ~torso_m & ~under_beard] = 0  # sin restos fuera
neck = np.zeros((H, W), np.uint8)
cv2.ellipse(neck, (int(195 * K), int(368 * K)), (int(78 * K), int(22 * K)), 0, 0, 360, 1, -1)
torso = paint_under(torso, neck.astype(bool), JACKET)
# laterales del torso que quedan bajo los brazos
side = poly_mask([(97, 440), (112, 440), (112, 600), (97, 600)]) | poly_mask([(274, 440), (288, 440), (288, 600), (274, 600)])
torso = paint_under(torso, side, JACKET)
# Faldones y pelvis (los faldones se mueven con resortes)
b16t = torso.astype(np.int16)
dpants = np.abs(big.astype(np.int16) - np.array(PANTS)).sum(-1)
plab, _ = ndi.label((dpants < 70) & (yy >= 566) & (xx > 118) & (xx < 272) & torso_m)
pid = plab[int(620 * K), int(195 * K)]
pelvis_real = (plab == pid) if pid > 0 else np.zeros_like(fg)
buckle = (((xx - 195) / 33) ** 2 + ((yy - 553) / 21) ** 2) <= 1
skirt_m = torso_m & (yy >= 562) & ~pelvis_real & ~buckle
for k, side in {'L': xx < 195, 'R': xx >= 195}.items():
    save(f'faldon_{k}', layer(skirt_m & side), pieces)
pel = layer(pelvis_real)
pel = paint_under(pel, poly_mask([(98, 556), (292, 556), (296, 640), (240, 650), (195, 646), (150, 650), (94, 640)]), PANTS)
save('pelvis', pel, pieces)
torso[((yy >= 568) & ~buckle) | pelvis_real] = 0
save('torso', torso, pieces)

# ---------- Charreteras (van por encima de los brazos) ----------
lum = b16.mean(-1)
for k, (x0, x1) in {'L': (30, 110), 'R': (280, 358)}.items():
    box = (xx >= x0) & (xx <= x1) & (yy >= 356) & (yy <= 446)
    m = box & (lum > 140) & torso_m
    m = ndi.binary_dilation(m, iterations=int(2.2 * K)) & torso_m & (xx >= x0 - 4) & (xx <= x1 + 4)
    save(f'charretera_{k}', layer(m), pieces)

# ---------- Brazos ----------
ARM = {
    'L': dict(m=armL_m, sh=(66, 412), el=(67, 510), hand=(61, 626), out=-1),
    'R': dict(m=armR_m, sh=(318, 412), el=(317, 510), hand=(323, 626), out=1),
}
for k, A in ARM.items():
    sx, sy = A['sh']
    ex, ey = A['el']
    m = A['m']
    # Brazo (hombro → codo): píxeles reales hasta el codo + casquetes pintados
    up_m = m & (yy < ey + 4)
    up = layer(up_m)
    cap = np.zeros((H, W), np.uint8)
    circle(cap, sx, sy, 28.5)
    cv2.rectangle(cap, (int((sx - 28.5) * K), int(sy * K)), (int((sx + 28.5) * K), int(445 * K)), 1, -1)
    circle(cap, ex, ey, 30)
    up = paint_under(up, cap.astype(bool), JACKET)
    save(f'brazo_{k}', up, pieces)
    # Antebrazo + mano
    fo_m = m & (yy >= ey - 2)
    fo = layer(fo_m)
    cap = np.zeros((H, W), np.uint8)
    circle(cap, ex, ey, 30)
    fo = paint_under(fo, cap.astype(bool), JACKET)
    hand = np.zeros((H, W), np.uint8)
    hx, hy = A['hand']
    cv2.ellipse(hand, (int(hx * K), int(hy * K)), (int(32 * K), int(31 * K)), 0, 0, 360, 1, -1)
    hand = hand.astype(bool) & (yy > 596)
    fo = paint_under(fo, hand, SKIN)
    save(f'antebrazo_{k}', fo, pieces)

# ---------- Piernas ----------
LEG = {'L': dict(x0=70, x1=196, hip=(146, 625), knee=(146, 704)),
       'R': dict(x0=195, x1=320, hip=(243, 625), knee=(243, 704))}
for k, Lg in LEG.items():
    zone = (xx >= Lg['x0']) & (xx < Lg['x1'])
    th_m = legs_m & zone & (yy < 712)
    th = layer(th_m)
    hx, hy = Lg['hip']
    top = np.zeros((H, W), np.uint8)
    cv2.ellipse(top, (int(hx * K), int(hy * K)), (int(45 * K), int(34 * K)), 0, 0, 360, 1, -1)
    cv2.rectangle(top, (int((hx - 45) * K), int(hy * K)), (int((hx + 45) * K), int(660 * K)), 1, -1)
    th[(top > 0) & (yy < 652)] = 0          # fuera restos del faldón
    th = paint_under(th, (top > 0) & (yy < 658), PANTS)
    save(f'muslo_{k}', th, pieces)
    sh_m = legs_m & zone & (yy >= 700)
    save(f'pierna_{k}', layer(sh_m), pieces)

FACE = tuple(int(c) for c in sample(172, 240, 1))
colors = {'face': '#%02x%02x%02x' % FACE, 'jacket': '#%02x%02x%02x' % tuple(JACKET), 'pants': '#%02x%02x%02x' % tuple(PANTS),
          'skin': '#%02x%02x%02x' % tuple(SKIN)}
(out_dir / 'piezas.json').write_text(json.dumps({'K': K, 'pieces': pieces, 'colors': colors}, indent=1))
print(json.dumps(colors), len(pieces), 'piezas')
