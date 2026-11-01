"""Promedia los sub-fotogramas (f_NNNN_k.png) en fotogramas finales con desenfoque de movimiento.
Uso: python3 blur.py <carpeta_subfotogramas> <carpeta_salida> <N_sub>
El promedio se hace con alfa premultiplicado para que los bordes transparentes queden limpios."""
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

src, dst, n = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
dst.mkdir(parents=True, exist_ok=True)
frames = sorted({p.name.rsplit('_', 1)[0] for p in src.glob('f_*_*.png')})


def do(name):
    acc = None
    for k in range(n):
        a = np.asarray(Image.open(src / f'{name}_{k}.png').convert('RGBA'), dtype=np.float32) / 255
        a[..., :3] *= a[..., 3:4]
        acc = a if acc is None else acc + a
    acc /= n
    al = acc[..., 3:4]
    rgb = np.where(al > 1e-4, acc[..., :3] / np.maximum(al, 1e-4), 0)
    out = np.concatenate([rgb, al], -1)
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst / f'{name}.png', compress_level=1)


with ProcessPoolExecutor() as ex:
    list(ex.map(do, frames))
print(len(frames), 'fotogramas en', dst)
