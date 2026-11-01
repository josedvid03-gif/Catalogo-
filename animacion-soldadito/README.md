# Soldadito Cascanueces bailando: animación 2D cutout estilo cartoon

Animación de 5 s en bucle para las pantallas de las columnas (62 × 194 cm), hecha con **las piezas recortadas
de la ilustración original** (`hoja_personaje.webp`, vista de frente). El personaje no se redibuja: sus partes
se mueven, rotan y deforman ligeramente (squash & stretch), así que se ve igual al diseño aprobado.

## Técnica (principios de animación)
- **Pose a pose con splines monótonas**: las curvas pasan por cada clave sin frenazos ni rebotes falsos.
- **Resortes amortiguados** en hombros, codos, torso, cabeza y squash: dan *overshoot* y asentamiento (el "snap" cartoon).
- **Anticipación** antes de cada acción (agacharse antes del salto, recoger el brazo antes de levantarlo).
- **Transferencia de peso** en los pasos: la cadera viaja sobre el pie de apoyo y los pies no patinan (cinemática inversa en las piernas).
- **Squash & stretch** del cuerpo en anticipaciones, saltos y aterrizajes.
- **Movimiento secundario con física**: barba, mechones de pelo, faldones de la chaqueta y charreteras reaccionan a la inercia (*follow-through* y *overlapping action*).
- **Párpados con cierre progresivo**, ojos felices, guiño y boca que ríe al ritmo.
- **60 fps con desenfoque de movimiento** real: 4 sub-fotogramas por fotograma con obturador de 180°.
- **Bucle perfecto**: la simulación corre 3 ciclos y se usa el último, así el final empalma con el inicio.

| Tiempo | Acción |
|---|---|
| 0–1 s | Balanceo al ritmo y parpadeo; anticipación |
| 1–2 s | Levanta el brazo derecho, saluda con la mano y da un paso lateral |
| 2–3 s | Levanta el otro brazo y mueve las caderas |
| 3–4 s | Patadas alternadas, brazos al ritmo y cabeza marcando el compás |
| 4–5 s | Se agacha, salta con estiramiento, aterriza con squash, saludo militar con guiño y vuelve a la pose inicial |

## Archivos
- `soldadito.js`: rig, coreografía (claves en `K`, resortes en `SPRING`, física secundaria en `SECP`) y dibujo.
- `preparar_piezas.py`: recorta la hoja en piezas (`piezas/`), rellena las zonas ocultas y genera siluetas de contorno.
- `render.js`: renderiza fotogramas con Chromium (`--fps`, `--blur`, `--modo final|rig|silueta`, `--parte i/n`).
- `blur.py`: promedia los sub-fotogramas (alfa premultiplicado) para el desenfoque de movimiento.
- `breakdown.js`: video de portafolio 1920×1080 (final · rig con huesos · silueta · curvas de animación).
- `videos/`: entregables (ver abajo).

## Videos (`videos/`)
- `soldadito_baile_1080x3380_60fps.mp4`: con fondo, para las pantallas.
- `soldadito_baile_620x1940_60fps.mp4`: igual, más liviano.
- `soldadito_baile_alfa_1080x3380.webm`: fondo transparente (VP9 con alfa).
- `soldadito_breakdown_1920x1080.mp4`: breakdown para portafolio.
- La versión ProRes 4444 con alfa (.mov) y los bucles largos no se guardan en el repo por su tamaño; se regeneran con los comandos de abajo.

## Cómo regenerar
```bash
pip install numpy scipy opencv-python-headless pillow
python3 preparar_piezas.py hoja_personaje.webp piezas
for i in 0 1 2 3; do node render.js /tmp/sub 1080 --fondo --fps 60 --blur 4 --parte $i/4 & done; wait
python3 blur.py /tmp/sub /tmp/frames 4
ffmpeg -framerate 60 -i /tmp/frames/f_%04d.png -c:v libx264 -crf 17 -pix_fmt yuv420p soldadito.mp4
node breakdown.js /tmp/bd --fps 60
ffmpeg -framerate 60 -i /tmp/bd/b_%04d.png -c:v libx264 -crf 18 -pix_fmt yuv420p breakdown.mp4
```
