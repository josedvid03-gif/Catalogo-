import { useState } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAvisar } from '../lib/aviso'
import { useAjustes } from '../lib/sesion'
import { hoyColombia } from '../lib/format'
import { sumarMeses } from '../lib/inversiones'
import { nombreMetodo } from '../components/MetodoPago'
import type { MetodoPago } from '../lib/types'
import { BotonAccion } from '../components/Comunes'
import { Icono } from '../components/Icono'
import type { Hoja } from '../lib/excel'

type Fila = Record<string, unknown>

/** Lee una tabla completa; si la tabla aún no existe, devuelve una lista vacía. */
async function todo(tabla: string, select = '*', orden?: string): Promise<Fila[]> {
  const filas: Fila[] = []
  for (let desde = 0; ; desde += 1000) {
    let q = supabase.from(tabla).select(select).range(desde, desde + 999)
    if (orden) q = q.order(orden)
    const { data, error } = await q
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') return []
      throw error
    }
    filas.push(...((data ?? []) as unknown as Fila[]))
    if (!data || data.length < 1000) return filas
  }
}

const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const n = (v: unknown) => (typeof v === 'number' ? v : v === null || v === undefined ? null : Number(v))
const metodo = (v: unknown) => (v ? nombreMetodo(v as MetodoPago) : '')

export function Exportar() {
  const avisar = useAvisar()
  const ajustes = useAjustes()
  const [estado, setEstado] = useState<string | null>(null)

  const exportar = async () => {
    try {
      setEstado('Leyendo datos…')
      const [inventario, productos, ventas, items, apartados, apItems, gastos, clientes, inversiones, pagos, movimientos] =
        await Promise.all([
          todo('inventario', '*', 'nombre'),
          todo('productos', '*', 'nombre'),
          todo('ventas', '*', 'fecha'),
          todo('venta_items', '*, ventas(numero, fecha, anulada)'),
          todo('apartados', '*', 'fecha'),
          todo('apartado_items', '*, apartados(numero)'),
          todo('gastos', '*', 'fecha'),
          todo('clientes', '*', 'nombre'),
          todo('inversiones', '*, inversores(nombre, telefono)', 'fecha_inicio'),
          todo('pagos_inversion', '*, inversiones(inversores(nombre))', 'fecha'),
          todo('movimientos', '*, variantes(talla, color, productos(nombre))', 'fecha'),
        ])
      setEstado('Armando el Excel…')
      const { crearExcel, descargar } = await import('../lib/excel')
      const nombreCliente = new Map(clientes.map((c) => [c.id as string, c.nombre as string]))
      const productoPorId = new Map(productos.map((p) => [p.id as string, p]))

      const hojas: Hoja[] = [
        {
          nombre: 'Inventario',
          columnas: [
            { titulo: 'Producto', ancho: 38 },
            { titulo: 'Marca', ancho: 16 },
            { titulo: 'Categoría', ancho: 16 },
            { titulo: 'Talla', ancho: 8 },
            { titulo: 'Color', ancho: 12 },
            { titulo: 'Stock', tipo: 'numero', ancho: 8 },
            { titulo: 'Apartado', tipo: 'numero', ancho: 10 },
            { titulo: 'Disponible', tipo: 'numero', ancho: 11 },
            { titulo: 'Costo', tipo: 'pesos', ancho: 12 },
            { titulo: 'Precio', tipo: 'pesos', ancho: 12 },
            { titulo: 'Valor a costo', tipo: 'pesos', ancho: 14 },
            { titulo: 'Valor a precio', tipo: 'pesos', ancho: 14 },
            { titulo: 'Activo', ancho: 8 },
          ],
          filas: inventario.map((i) => {
            const p = productoPorId.get(i.producto_id as string)
            return [
              t(i.nombre),
              t(p?.marca),
              t(i.categoria),
              t(i.talla),
              t(i.color),
              n(i.stock),
              n(i.reservado),
              n(i.disponible),
              n(i.costo),
              n(i.precio),
              (n(i.stock) ?? 0) * (n(i.costo) ?? 0),
              (n(i.stock) ?? 0) * (n(i.precio) ?? 0),
              i.activo ? 'Sí' : 'No',
            ]
          }),
        },
        {
          nombre: 'Ventas',
          columnas: [
            { titulo: 'Número', tipo: 'numero', ancho: 9 },
            { titulo: 'Fecha', tipo: 'fechaHora', ancho: 17 },
            { titulo: 'Cliente', ancho: 22 },
            { titulo: 'Método de pago', ancho: 15 },
            { titulo: 'Total', tipo: 'pesos', ancho: 13 },
            { titulo: 'Costo', tipo: 'pesos', ancho: 13 },
            { titulo: 'Ganancia', tipo: 'pesos', ancho: 13 },
            { titulo: 'Anulada', ancho: 9 },
            { titulo: 'Nota', ancho: 24 },
            { titulo: 'Registró', ancho: 24 },
          ],
          filas: ventas.map((v) => [
            n(v.numero),
            t(v.fecha),
            t(v.cliente_id ? nombreCliente.get(v.cliente_id as string) : v.cliente) || t(v.cliente),
            metodo(v.metodo_pago),
            n(v.total),
            n(v.costo_total),
            (n(v.total) ?? 0) - (n(v.costo_total) ?? 0),
            v.anulada ? 'Sí' : 'No',
            t(v.nota),
            t(v.creado_por),
          ]),
        },
        {
          nombre: 'Detalle de ventas',
          columnas: [
            { titulo: 'Venta', tipo: 'numero', ancho: 8 },
            { titulo: 'Fecha', tipo: 'fechaHora', ancho: 17 },
            { titulo: 'Prenda', ancho: 42 },
            { titulo: 'Marca', ancho: 16 },
            { titulo: 'Cantidad', tipo: 'numero', ancho: 9 },
            { titulo: 'Precio', tipo: 'pesos', ancho: 12 },
            { titulo: 'Costo', tipo: 'pesos', ancho: 12 },
            { titulo: 'Ganancia', tipo: 'pesos', ancho: 12 },
            { titulo: 'Anulada', ancho: 9 },
          ],
          filas: items.map((i) => {
            const v = (i.ventas ?? {}) as Fila
            const cant = n(i.cantidad) ?? 0
            return [
              n(v.numero),
              t(v.fecha),
              t(i.descripcion),
              t(productoPorId.get(i.producto_id as string)?.marca),
              cant,
              n(i.precio_unit),
              n(i.costo_unit),
              cant * ((n(i.precio_unit) ?? 0) - (n(i.costo_unit) ?? 0)),
              v.anulada ? 'Sí' : 'No',
            ]
          }),
        },
        {
          nombre: 'Apartados',
          columnas: [
            { titulo: 'Número', tipo: 'numero', ancho: 9 },
            { titulo: 'Fecha', tipo: 'fechaHora', ancho: 17 },
            { titulo: 'Cliente', ancho: 22 },
            { titulo: 'Celular', ancho: 14 },
            { titulo: 'Prendas', ancho: 44 },
            { titulo: 'Total', tipo: 'pesos', ancho: 12 },
            { titulo: 'Anticipo', tipo: 'pesos', ancho: 12 },
            { titulo: 'Saldo', tipo: 'pesos', ancho: 12 },
            { titulo: 'Fecha límite', tipo: 'fecha', ancho: 13 },
            { titulo: 'Estado', ancho: 12 },
            { titulo: 'Anticipo devuelto', ancho: 10 },
          ],
          filas: apartados.map((a) => [
            n(a.numero),
            t(a.fecha),
            t(a.cliente),
            t(a.telefono),
            apItems
              .filter((i) => i.apartado_id === a.id)
              .map((i) => `${i.cantidad}× ${i.descripcion}`)
              .join(', '),
            n(a.total),
            n(a.anticipo),
            (n(a.total) ?? 0) - (n(a.anticipo) ?? 0),
            t(a.fecha_limite),
            t(a.estado),
            a.anticipo_devuelto ? 'Sí' : 'No',
          ]),
        },
        {
          nombre: 'Gastos',
          columnas: [
            { titulo: 'Fecha', tipo: 'fecha', ancho: 12 },
            { titulo: 'Categoría', ancho: 16 },
            { titulo: 'Descripción', ancho: 34 },
            { titulo: 'Valor', tipo: 'pesos', ancho: 13 },
            { titulo: 'Método de pago', ancho: 15 },
            { titulo: 'Registró', ancho: 24 },
          ],
          filas: gastos.map((g) => [t(g.fecha), t(g.categoria), t(g.descripcion), n(g.monto), metodo(g.metodo_pago), t(g.creado_por)]),
        },
        {
          nombre: 'Clientes',
          columnas: [
            { titulo: 'Nombre', ancho: 24 },
            { titulo: 'Celular', ancho: 14 },
            { titulo: 'Instagram', ancho: 16 },
            { titulo: 'Tallas', ancho: 12 },
            { titulo: 'Le gusta', ancho: 24 },
            { titulo: 'Compras', tipo: 'numero', ancho: 9 },
            { titulo: 'Total comprado', tipo: 'pesos', ancho: 15 },
            { titulo: 'Notas', ancho: 30 },
          ],
          filas: clientes.map((c) => {
            const suyas = ventas.filter((v) => v.cliente_id === c.id && !v.anulada)
            return [
              t(c.nombre),
              t(c.telefono),
              t(c.instagram),
              t(c.tallas),
              t(c.intereses),
              suyas.length,
              suyas.reduce((s, v) => s + (n(v.total) ?? 0), 0),
              t(c.notas),
            ]
          }),
        },
        {
          nombre: 'Inversiones',
          columnas: [
            { titulo: 'Inversor', ancho: 22 },
            { titulo: 'Celular', ancho: 14 },
            { titulo: 'Tipo', ancho: 18 },
            { titulo: 'Capital', tipo: 'pesos', ancho: 14 },
            { titulo: 'Tasa %', tipo: 'numero', ancho: 8 },
            { titulo: 'Plazo (meses)', tipo: 'numero', ancho: 9 },
            { titulo: 'Inicio', tipo: 'fecha', ancho: 12 },
            { titulo: 'Fin', tipo: 'fecha', ancho: 12 },
            { titulo: 'Rendimientos pagados', tipo: 'pesos', ancho: 16 },
            { titulo: 'Capital devuelto', tipo: 'pesos', ancho: 15 },
            { titulo: 'Estado', ancho: 11 },
          ],
          filas: inversiones.map((i) => {
            const suyos = pagos.filter((p) => p.inversion_id === i.id)
            const inv = (i.inversores ?? {}) as Fila
            return [
              t(inv.nombre),
              t(inv.telefono),
              i.tipo === 'interes' ? 'Interés fijo mensual' : '% de las ganancias',
              n(i.monto),
              n(i.tasa),
              n(i.plazo_meses),
              t(i.fecha_inicio),
              sumarMeses(String(i.fecha_inicio), Number(i.plazo_meses)),
              suyos.filter((p) => p.tipo === 'rendimiento').reduce((s, p) => s + (n(p.monto) ?? 0), 0),
              suyos.filter((p) => p.tipo === 'capital').reduce((s, p) => s + (n(p.monto) ?? 0), 0),
              t(i.estado),
            ]
          }),
        },
        {
          nombre: 'Pagos a inversores',
          columnas: [
            { titulo: 'Fecha', tipo: 'fecha', ancho: 12 },
            { titulo: 'Inversor', ancho: 22 },
            { titulo: 'Tipo', ancho: 13 },
            { titulo: 'Valor', tipo: 'pesos', ancho: 13 },
            { titulo: 'Periodo', ancho: 10 },
            { titulo: 'Nota', ancho: 28 },
          ],
          filas: pagos.map((p) => {
            const inv = ((p.inversiones ?? {}) as Fila).inversores as Fila | undefined
            return [t(p.fecha), t(inv?.nombre), p.tipo === 'capital' ? 'Capital' : 'Rendimiento', n(p.monto), t(p.periodo), t(p.nota)]
          }),
        },
        {
          nombre: 'Movimientos inventario',
          columnas: [
            { titulo: 'Fecha', tipo: 'fechaHora', ancho: 17 },
            { titulo: 'Prenda', ancho: 34 },
            { titulo: 'Talla', ancho: 8 },
            { titulo: 'Tipo', ancho: 12 },
            { titulo: 'Cantidad', tipo: 'numero', ancho: 9 },
            { titulo: 'Quedaron', tipo: 'numero', ancho: 9 },
            { titulo: 'Nota', ancho: 26 },
            { titulo: 'Registró', ancho: 24 },
          ],
          filas: movimientos.map((m) => {
            const v = (m.variantes ?? {}) as Fila
            return [
              t(m.fecha),
              t((v.productos as Fila | undefined)?.nombre),
              t(v.talla),
              t(m.tipo),
              n(m.cantidad),
              n(m.stock_resultante),
              t(m.nota),
              t(m.creado_por),
            ]
          }),
        },
      ]

      const tienda = ajustes.nombre_tienda.replace(/[^\w]+/g, '') || 'Tienda'
      descargar(crearExcel(hojas), `${tienda}-respaldo-${hoyColombia()}.xlsx`)
      setEstado(null)
      avisar('Excel descargado')
    } catch (e) {
      setEstado(null)
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Exportar a Excel</h1>
      </div>
      <section className="tarjeta">
        <h2>Copia de seguridad completa</h2>
        <p>
          Descarga un archivo de Excel con todo lo de la tienda, una hoja por tema: inventario, ventas, detalle de
          ventas, apartados, gastos, clientes, inversiones, pagos a inversores y movimientos de inventario.
        </p>
        <p className="sutil">
          Recomendado: descárgalo una vez por semana y guárdalo en Google Drive o en tu correo. El plan gratis de
          Supabase no guarda copias automáticas.
        </p>
        <BotonAccion className="btn btn-primario btn-bloque" onClick={exportar}>
          <Icono nombre="descargar" /> {estado ?? 'Descargar Excel'}
        </BotonAccion>
      </section>
    </div>
  )
}

