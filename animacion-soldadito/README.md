# Soldadito bailando (pantallas 62 × 194)

Animación de 5 s a 24 fps (120 fotogramas) hecha con **las piezas recortadas de la ilustración original**
(`hoja_personaje.webp`, vista de frente). No se redibuja el personaje: solo se mueven y rotan sus partes.
El último fotograma enlaza con el primero, así que se puede reproducir en bucle sin cortes.

| Tiempo | Movimiento |
|---|---|
| 0–1 s | Parpadea y empieza a balancearse |
| 1–2 s | Levanta el brazo derecho, saluda y da un paso lateral |
| 2–3 s | Levanta el otro brazo y mueve las caderas |
| 3–4 s | Alterna los pies y mueve la cabeza al ritmo |
| 4–5 s | Saludo militar con guiño y vuelve a la pose inicial |

## Videos (`videos/`)
- `soldadito_baile_1080x3380.mp4`: con fondo, H.264 (proporción 62:194).
- `soldadito_baile_620x1940.mp4`: igual, en menor resolución (10 px por cm).
- `soldadito_baile_alfa_1080x3380.webm`: fondo transparente (VP9 con alfa).
- La versión ProRes 4444 con alfa (.mov) y un bucle de 30 s no se guardan en el repo por su tamaño;
  se regeneran con los comandos de abajo.

## Cómo regenerar
```bash
pip install numpy scipy opencv-python-headless pillow
python3 preparar_piezas.py hoja_personaje.webp piezas      # recorta las piezas
node render.js /tmp/fondo 1080 --fondo                       # fotogramas con fondo
node render.js /tmp/alfa 1080                                # fotogramas transparentes
ffmpeg -framerate 24 -i /tmp/fondo/f_%04d.png -c:v libx264 -crf 17 -pix_fmt yuv420p soldadito.mp4
ffmpeg -framerate 24 -i /tmp/alfa/f_%04d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le soldadito_alfa.mov
```
La coreografía está en `soldadito.js` (función `pose`); el fondo y los efectos, en `background`/`foreground`.
