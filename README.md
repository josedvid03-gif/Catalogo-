# Inventario de la tienda

App web para manejar la tienda de ropa desde el celular, la tablet o el computador.
Se instala en la pantalla de inicio como una app y todos los dispositivos ven los mismos datos.

## Qué hace

- **Productos** con fotos, categoría, costo, precio de venta, tallas y colores, cada uno con su stock.
- **Inventario actual**: unidades en tienda, valor a costo, valor a precio de venta y ganancia esperada.
- **Ventas**: buscas la prenda, ajustas el precio si das descuento y eliges el método de pago
  (efectivo, transferencia, tarjeta u otro). El stock se descuenta solo. Una venta hecha por error
  se puede anular y las prendas vuelven al inventario.
- **Apartados**: el cliente deja un anticipo (30% sugerido, editable) y tiene 30 días para recoger.
  - Las prendas apartadas se reservan y no se pueden vender a otra persona.
  - Al recoger, se cobra el saldo y queda registrada la venta.
  - Si no completa el pago, se cancela, se marca el anticipo como devuelto y la ropa vuelve a estar disponible.
  - El plazo se puede extender.
  - Se puede enviar el comprobante al cliente por WhatsApp.
- **Resumen del mes**: ventas, ganancia, margen, ventas por método de pago, lo más vendido,
  apartados por vencer y prendas con poco stock.
- **Importar desde Excel / Google Sheets**: copias las filas y las pegas. La app separa la talla del nombre
  ("CAMISETA NIKE TALLA S" → Camiseta Nike, talla S), lee precios como "110.000", adivina la categoría
  y junta las prendas repetidas como varias unidades. Antes de importar puedes revisar y corregir todo.
- **Costos de compra**: una lista para llenar rápido los costos que falten. Si vendes algo antes de ponerle
  el costo, al ponérselo la ganancia de esa venta se corrige sola.
- **Inversores**: registras a cada inversor y su inversión de dos formas:
  - *Interés fijo mensual* (ej. 5% al mes sobre $5.000.000 durante 6 meses): el interés se paga cada mes
    y el capital al final.
  - *% de las ganancias* (ej. 30% de la ganancia de las ventas de cada mes) y el capital al final.

  La app arma el cronograma de pagos, muestra plazos (fecha de devolución y días que faltan), rentabilidad
  (mensual, total y efectiva anual), pagos vencidos y cuánto te queda del mes después de pagar a los
  inversores. Cada pago se registra (se aceptan abonos parciales) y puedes enviarle al inversor su
  extracto por WhatsApp. Solo tú y tu equipo ven esta sección.
- **Caja y gastos**: registra arriendo, transporte, publicidad, bolsas, sueldos… y ve la **ganancia neta**
  del mes (ventas − costo de la ropa − gastos). El **cierre del día** muestra lo que entró y salió por método
  de pago (efectivo, transferencia, tarjeta), cuenta el efectivo contra la base y dice si sobra o falta.
- **Fotos rápidas**: recorre las prendas sin foto una por una; tomas la foto con el celular, se guarda sola
  y pasa a la siguiente. También hay un filtro "Sin foto" en Productos.
- **Historial** de cada producto: entradas, ventas, ajustes y anulaciones, con quién lo hizo.
- **Catálogo público profesional** (`/catalogo`), con los colores y el logo de la marca:
  - Portada, filtros por categoría, marca y **talla**, búsqueda y orden por precio o rebajas.
  - Etiquetas **NUEVO** y **-30%** (precio anterior tachado).
  - Página propia para cada prenda (`/catalogo/p/…`) con galería, tallas, **Compartir** (envía la foto)
    y **Agregar al pedido**.
  - **Pedido:** el cliente arma su bolsa y te llega **un solo WhatsApp** con la lista, tallas y total.
  - El pedido pide **datos de envío** (nombre, celular, cédula, ciudad, dirección) o "recoger en persona",
    y muestra **cómo pagar por Nequi** (número con botón copiar y QR).
  - Botón flotante de **WhatsApp** y **preguntas rápidas** en cada prenda.
  - **Nunca muestra costos ni ganancias.**
- **Varios WhatsApp (asesores)**: en Ajustes agregas los números de tus asesores; a cada cliente del
  catálogo le toca uno (siempre el mismo) y ve "Te atiende: …".
- **Mensajes**: cada vez que un cliente toca un botón de WhatsApp en el catálogo queda registrado
  (pedido o pregunta, prenda, total, datos de envío y a qué asesor le llegó). Se marcan como atendido,
  vendido o descartado, con nota, y hay estadísticas por asesor. *La conversación en sí queda en WhatsApp.*
- **Clientes**: se guardan solos al vender o apartar con su celular. Ficha con historial de compras,
  tallas y gustos; la app sugiere qué prendas ofrecerle y arma el mensaje de WhatsApp. En cada producto
  aparece **"Avisar a clientes"** con quienes usan esa talla.
- **Marcas y rebajas**: la marca se detecta sola por el nombre (Nike, Dickies, Columbia…) y cada prenda
  puede tener un *precio antes* para mostrarla en rebaja.
- **Reportes**: gráfica de ventas y ganancia neta por mes, marcas y categorías que más se venden y
  cuántos días tardan en venderse.
- **Exportar a Excel**: un archivo con todo (inventario, ventas, apartados, gastos, clientes,
  inversores…) para tener copia de seguridad.
- **Equipo**: solo los correos autorizados pueden entrar (ej. 3 usuarios).
- Precios en pesos colombianos y fechas con la hora de Colombia.

## Puesta en marcha (una sola vez, ~20 minutos)

Necesitas dos cuentas gratuitas: **Supabase** (base de datos y fotos) y **Vercel** (publica la app).

### 1. Crear la base de datos en Supabase

1. Entra a <https://supabase.com>, crea una cuenta y un proyecto nuevo
   (región recomendada: *South America (São Paulo)*). Guarda la contraseña de la base de datos.
2. Abre **SQL Editor → New query**.
3. Copia todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pégalo.
4. Al final del archivo, cambia `tu-correo@ejemplo.com` por **tu correo**.
5. Presiona **Run**. Debe decir *Success*.

> Cuando la app reciba mejoras que cambien la base de datos (como Inversores), vuelve a pegar y ejecutar
> el archivo completo. Se puede ejecutar varias veces y **no borra tus datos**.

### 2. Crear los usuarios

1. En Supabase ve a **Authentication → Users → Add user → Create new user**.
2. Escribe el correo y una contraseña y marca **Auto Confirm User**.
3. Repite para cada persona del equipo.
4. Para que puedan entrar, agrega también sus correos en la app: **Ajustes → Equipo** (el tuyo ya quedó en el paso 1).
5. Recomendado: en **Authentication → Sign In / Providers**, desactiva *Allow new users to sign up*
   para que nadie más pueda crear cuentas.

### 3. Copiar las claves

En Supabase ve a **Project Settings → API** (o *API Keys*) y copia:

- **Project URL**, por ejemplo `https://abcdxyz.supabase.co`
- **anon public key** (o *Publishable key*)

La clave pública se puede usar en la app sin problema; los permisos los controla la base de datos.
**Nunca** uses la clave `service_role` / *secret*.

### 4. Publicar la app en Vercel

1. Entra a <https://vercel.com> con tu cuenta de GitHub.
2. **Add New → Project** e importa este repositorio. Vercel detecta que es Vite.
3. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = el Project URL
   - `VITE_SUPABASE_ANON_KEY` = la clave pública
4. Presiona **Deploy**. Al terminar te da una dirección como `https://mi-tienda.vercel.app`.

Vercel publica la rama principal (`main`). Cada cambio que se suba a GitHub se publica solo.

### 5. Cargar tu inventario desde Excel

1. En Google Sheets selecciona las filas de productos (desde la columna del nombre hasta la del precio) y copia.
2. En la app: **Productos → Importar** → pega → **Revisar productos**.
3. Revisa que la columna del nombre y la del precio sean las correctas.
4. Desmarca lo que ya se vendió (por ejemplo, las filas en rojo) y presiona **Importar**.
5. Lo que está separado (filas en verde): impórtalo y créale el apartado en **Apartados → Nuevo**
   con el anticipo que dejó el cliente.
6. Cuando tengas los costos de compra: **Productos → aviso "sin costo" → Costos de compra**.

### 6. Instalar en el celular

- **Android (Chrome):** abre la dirección → menú ⋮ → *Agregar a la pantalla principal* / *Instalar app*.
- **iPhone (Safari):** abre la dirección → botón compartir → *Agregar a inicio*.

## Actualizaciones de la base de datos

Algunas mejoras necesitan tablas nuevas. Si la app dice *"Falta actualizar la base de datos"*,
en Supabase abre **SQL Editor → New query**, pega el archivo indicado y presiona **Run**
(se puede ejecutar varias veces sin perder datos):

| Archivo | Para qué |
|---|---|
| [`supabase/actualizaciones/01-gastos-y-caja.sql`](supabase/actualizaciones/01-gastos-y-caja.sql) | Gastos y cierre de caja |
| [`supabase/actualizaciones/02-marcas-clientes-catalogo.sql`](supabase/actualizaciones/02-marcas-clientes-catalogo.sql) | Marcas, rebajas, clientes y catálogo profesional |
| [`supabase/actualizaciones/03-pagos-nequi.sql`](supabase/actualizaciones/03-pagos-nequi.sql) | Nequi como método de pago y datos de pago en el catálogo |
| [`supabase/actualizaciones/04-asesores-mensajes.sql`](supabase/actualizaciones/04-asesores-mensajes.sql) | Varios WhatsApp (asesores) y bandeja de mensajes del catálogo |

Si instalas desde cero, basta con `supabase/schema.sql` (ya incluye todo).

## Uso diario

| Quiero… | Dónde |
|---|---|
| Registrar una venta | **Vender** → busca la prenda → toca para agregar → método de pago → *Registrar venta* |
| Apartar ropa | **Vender → Apartar** (o **Apartados → Nuevo**) |
| Entregar un apartado | **Apartados** → *Entregar · cobrar saldo* |
| Cancelar un apartado | **Apartados** → *Cancelar* (marca si ya devolviste el anticipo) |
| Llegó mercancía | **Productos** → el producto → sube el stock de la talla → *Guardar cambios* |
| Cargar muchos productos | **Productos → Importar** (pegar desde Excel) |
| Poner costos de compra | **Productos → Costos de compra** (aparece el aviso si faltan) |
| Registrar un inversor | **Inversores** (ícono 📈 arriba) → **Nueva** |
| Pagarle a un inversor | **Inversores** → el inversor → *Pagar* en el cronograma |
| Registrar un gasto | **Caja** (ícono 👛 arriba) → **Gastos** → **+ Gasto** |
| Cerrar caja del día | **Caja** → **Cierre del día** → base y efectivo contado → *Guardar cierre* |
| Poner fotos a muchas prendas | **Productos** → aviso *"sin foto · Fotos rápidas"* |
| Ver clientes / avisar novedades | **Más → Clientes** → la persona → *Le puede interesar* |
| Poner una prenda en rebaja | **Productos** → la prenda → *Precio antes* |
| Copia de seguridad | **Más → Exportar a Excel** (una vez por semana) |
| Producto nuevo | **Productos → Nuevo** → fotos, datos, tallas → *Crear producto* |
| Corregir una venta | **Ventas** → toca la venta → *Anular venta* |
| Compartir el catálogo | **Ajustes → Catálogo para clientes → Compartir** |

**Stock vs. disponible:** el *stock* es lo que hay físicamente en la tienda (incluye lo apartado).
El *disponible* es lo que se puede vender ya (stock menos apartados).

## Notas

- El plan gratuito de Supabase pausa el proyecto si pasa una semana sin uso. Si pasa, entra a
  supabase.com y presiona *Restore*.
- Las fotos se comprimen automáticamente antes de subirse (≈100–300 KB cada una).
- Para respaldo: **Más → Exportar a Excel** descarga todo en un archivo.

## Para desarrolladores

```bash
cp .env.example .env   # y llena las dos variables
npm install
npm run dev            # http://localhost:5173
npm run build          # compila en dist/
```

React + TypeScript + Vite, `@supabase/supabase-js`, PWA con `vite-plugin-pwa`.
La lógica crítica (ventas, apartados, reservas de stock, anulaciones) está en funciones
de Postgres en `supabase/schema.sql`, así que es atómica aunque varias personas vendan al mismo tiempo.

```
supabase/schema.sql   tablas, vista de inventario, funciones, permisos (RLS) y bucket de fotos
src/lib/              cliente de Supabase, formatos (COP, fechas), sesión, fotos
src/components/       diseño general, carrito, campos y componentes comunes
src/pages/            Resumen, Productos, ProductoForm, Vender, Apartados, NuevoApartado,
                      Ventas, Ajustes, Importar, Costos, Inversores, InversionForm,
                      InversionDetalle, Catalogo (público), Login
```
