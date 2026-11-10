# Soldadito con volumen (3D con aspecto de ilustración)

Versión en la que el soldado deja de ser una marioneta de recortes: es un **cuerpo 3D** modelado a partir de las
vistas de frente, lado y espalda de la hoja de personaje, pero **pintado como el dibujo**: colores planos con
sombreado suave, línea de contorno oscura en cada pieza y el emblema original del sombrero.

Al tener volumen puede hacer lo que el 2D no podía: girar el cuerpo y la cabeza, marchar con las rodillas
viniendo hacia la cámara y dar una vuelta completa en el aire mostrando la espalda.

## Cómo está hecho
- `soldado3d.js`: modelo (three.js), rig y animación.
  - Modelo con cilindros, esferas y superficies de revolución; proporciones medidas sobre la hoja de personaje.
  - Estilo: material *toon* con rampa suave + contorno por detección de bordes entre piezas (pasada de identificadores).
  - Animación: claves con splines monótonas, resortes con *overshoot*, squash & stretch, cinemática inversa 3D en
    las piernas y física secundaria (barba, sombrero, faldones y charreteras; la fuerza centrífuga del giro los abre).
- `emblema.png`: emblema del sombrero extraído de la ilustración original y desenrollado para envolver el cilindro.
- `render3d.js`: render con Chromium (WebGL por software) a PNG con transparencia.

| Tiempo | Acción |
|---|---|
| 0–1 s | Ritmo con twist de caderas y brazos; parpadeo |
| 1–2 s | Levanta el brazo derecho, saluda con la mano y da un paso lateral |
| 2–3 s | Los dos brazos arriba; caderas a doble tiempo |
| 3–3,75 s | Marcha: rodillas arriba hacia la cámara, brazos al contrario |
| 3,75–4,4 s | Se agacha y salta con giro de 360° |
| 4,4–5 s | Aterriza, saludo militar con guiño y vuelve a la pose inicial |

## Cómo regenerar
```bash
npm install            # three.js
for i in 0 1 2 3; do node render3d.js /tmp/s3 1080 --fps 60 --blur 3 --parte $i/4 & done; wait
python3 ../blur.py /tmp/s3 /tmp/f3 3                     # desenfoque de movimiento
node render3d.js /tmp/g3 1080 --solo 0 --capa regalos    # regalos (capa fija)
(cd .. && node render.js /tmp/bg3 1080 --fondo --modo solofondo --fps 60)   # fondo animado
ffmpeg -framerate 60 -i /tmp/bg3/f_%04d.png -framerate 60 -i /tmp/f3/f_%04d.png -i /tmp/g3/t_0.00.png \
  -filter_complex "[0][1]overlay[a];[a][2]overlay" -c:v libx264 -crf 17 -pix_fmt yuv420p soldadito3d.mp4
```
Otras vistas para revisar el modelo: `node render3d.js /tmp/v 620 --solo 0 --vista 90` (lado), `--vista 180` (espalda).
