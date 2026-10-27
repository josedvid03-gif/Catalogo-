import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAjustes } from '../lib/sesion'
import { cop, diasHasta, hoyColombia, mesActual, moverMes, nombreMes, num, rangoMes, varianteTexto } from '../lib/format'
import type { ItemInventario, MetodoPago } from '../lib/types'
import { METODOS } from '../lib/types'
import { CajaError, Cargando, Dato, Foto } from '../components/Comunes'
import { Icono } from '../components/Icono'
import { cargarInversiones } from '../lib/datosInversiones'
import { resumirInversion } from '../lib/inversiones'
import { contarMensajesNuevos } from './Mensajes'
import { resumenVisitas } from '../components/LoMasVisto'

interface VentaMes {
  total: number
  costo_total: number
  metodo_pago: MetodoPago
  venta_items: { producto_id: string | null; descripcion: string; cantidad: number }[]
}

interface ApartadoActivo {
  total: number
  anticipo: number
  fecha_limite: string
}

export function Resumen() {
  const ajustes = useAjustes()
  const [mes, setMes] = useState(mesActual())

  const inv = useCarga(
    async () => datos(await supabase.from('inventario').select('*').eq('activo', true)) as ItemInventario[],
  )
  const ventas = useCarga(async () => {
    const { desde, hasta } = rangoMes(mes)
    return datos(
      await supabase
        .from('ventas')
        .select('total, costo_total, metodo_pago, venta_items(producto_id, descripcion, cantidad)')
        .eq('anulada', false)
        .gte('fecha', desde)
        .lt('fecha', hasta),
    ) as VentaMes[]
  }, [mes])
  const gastosMes = useCarga(async () => {
    const siguiente = moverMes(mes, 1)
    const r = await supabase.from('gastos').select('monto').gte('fecha', `${mes}-01`).lt('fecha', `${siguiente}-01`)
    // Si la tabla aún no existe (falta la actualización), se muestra $0.
    return r.error ? 0 : (r.data as { monto: number }[]).reduce((s, g) => s + g.monto, 0)
  }, [mes])
  const apartados = useCarga(
    async () =>
      datos(
        await supabase.from('apartados').select('total, anticipo, fecha_limite').eq('estado', 'activo'),
      ) as ApartadoActivo[],
  )

  // Los pagos a inversores no bloquean el resumen si fallan.
  const inversiones = useCarga(() => cargarInversiones())
  const pagosInversores = (inversiones.data?.inversiones ?? [])
    .filter((i) => i.estado === 'activa')
    .flatMap((i) => resumirInversion(i, hoyColombia(), inversiones.data!.ganancias).vencidas)
  const deudaInversores = pagosInversores.reduce((s, c) => s + c.monto - c.pagado, 0)

  const mensajesNuevos = useCarga(contarMensajesNuevos).data ?? 0
  const visitas = useCarga(resumenVisitas).data

  const error = inv.error || ventas.error || apartados.error
  if (error) {
    return (
      <CajaError
        mensaje={error}
        reintentar={() => {
          void inv.recargar()
          void ventas.recargar()
          void apartados.recargar()
        }}
      />
    )
  }

  // Inventario
  const items = inv.data ?? []
  const unidades = items.reduce((s, i) => s + i.stock, 0)
  const valorCosto = items.reduce((s, i) => s + i.stock * i.costo, 0)
  const valorVenta = items.reduce((s, i) => s + i.stock * i.precio, 0)
  const sinCosto = new Set(items.filter((i) => i.costo === 0).map((i) => i.producto_id)).size
  const bajos = items
    .filter((i) => i.disponible <= ajustes.stock_minimo)
    .sort((a, b) => a.disponible - b.disponible)

  // Ventas del mes
  const vs = ventas.data ?? []
  const ingresos = vs.reduce((s, v) => s + v.total, 0)
  const costoVendido = vs.reduce((s, v) => s + v.costo_total, 0)
  const ganancia = ingresos - costoVendido
  const porMetodo = METODOS.map((m) => ({
    ...m,
    total: vs.filter((v) => v.metodo_pago === m.id).reduce((s, v) => s + v.total, 0),
  })).filter((m) => m.total > 0)
  const prendasVendidas = new Map<string, number>()
  for (const v of vs) {
    for (const it of v.venta_items) {
      const nombre = it.descripcion.split(' · ')[0]
      prendasVendidas.set(nombre, (prendasVendidas.get(nombre) ?? 0) + it.cantidad)
    }
  }
  const top = [...prendasVendidas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Apartados
  const aps = apartados.data ?? []
  const anticipos = aps.reduce((s, a) => s + a.anticipo, 0)
  const porCobrar = aps.reduce((s, a) => s + (a.total - a.anticipo), 0)
  const vencidos = aps.filter((a) => diasHasta(a.fecha_limite) < 0).length
  const porVencer = aps.filter((a) => {
    const d = diasHasta(a.fecha_limite)
    return d >= 0 && d <= 3
  }).length

  const cargandoTodo = !inv.data || !ventas.data || !apartados.data

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Resumen</h1>
        <div className="acciones">
          <Link to="/vender" className="btn btn-primario">
            <Icono nombre="vender" /> Vender
          </Link>
        </div>
      </div>

      {cargandoTodo && <Cargando />}

      {mensajesNuevos > 0 && (
        <Link to="/mensajes" className="alerta-linea alerta-info">
          <Icono nombre="chat" />
          {mensajesNuevos} mensaje{mensajesNuevos === 1 ? '' : 's'} del catálogo sin atender →
        </Link>
      )}

      {pagosInversores.length > 0 && (
        <Link to="/inversores" className="alerta-linea">
          <Icono nombre="inversores" />
          {pagosInversores.length} pago{pagosInversores.length === 1 ? '' : 's'} a inversores por hacer:{' '}
          {cop(deudaInversores)} →
        </Link>
      )}

      {sinCosto > 0 && (
        <Link to="/productos/costos" className="alerta-linea">
          <Icono nombre="alerta" />
          {sinCosto} producto{sinCosto === 1 ? '' : 's'} sin costo de compra: la ganancia se ve más alta de lo real.
          Ponerlos →
        </Link>
      )}

      {visitas && (
        <section className="seccion">
          <div className="seccion-cabeza">
            <h2>Catálogo</h2>
            <Link to="/reportes" className="enlace">
              Ver detalle →
            </Link>
          </div>
          <div className="datos">
            <Dato etiqueta="Visitas hoy" valor={num(visitas.hoy)} />
            <Dato etiqueta="Visitas en 7 días" valor={num(visitas.semana)} />
            <Dato etiqueta="Pedidos por WhatsApp (7 días)" valor={num(visitas.pedidos)} tono={visitas.pedidos ? 'bien' : undefined} />
          </div>
        </section>
      )}

      <section className="seccion">
        <div className="seccion-cabeza">
          <h2>Ventas</h2>
          <div className="selector-mes">
            <button className="btn-icono" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>
              <Icono nombre="atras" />
            </button>
            <span>{nombreMes(mes)}</span>
            <button
              className="btn-icono"
              aria-label="Mes siguiente"
              disabled={mes >= mesActual()}
              onClick={() => setMes(moverMes(mes, 1))}
            >
              <Icono nombre="adelante" />
            </button>
          </div>
        </div>
        <div className="datos">
          <Dato etiqueta="Vendido" valor={cop(ingresos)} nota={`${vs.length} venta${vs.length === 1 ? '' : 's'}`} />
          <Dato
            etiqueta="Ventas − costo de la ropa"
            valor={cop(ganancia)}
            nota={`Costo de lo vendido ${cop(costoVendido)}`}
          />
          <Link to="/caja?ver=gastos" className="dato dato-enlace">
            <div className="dato-etiqueta">Gastos</div>
            <div className="dato-valor">{cop(gastosMes.data ?? 0)}</div>
            <div className="dato-nota">Arriendo, transporte… · Ver →</div>
          </Link>
          <Dato
            etiqueta="Ganancia neta"
            valor={cop(ganancia - (gastosMes.data ?? 0))}
            tono={ganancia - (gastosMes.data ?? 0) >= 0 ? 'bien' : 'mal'}
            nota={
              ingresos && ganancia - (gastosMes.data ?? 0) > 0
                ? `${Math.round(((ganancia - (gastosMes.data ?? 0)) / ingresos) * 100)}% de lo vendido`
                : 'Ventas − costo − gastos'
            }
          />
        </div>
        <Link to="/caja" className="enlace">
          Cierre de caja de hoy →
        </Link>
        {porMetodo.length > 0 && (
          <div className="chips-info">
            {porMetodo.map((m) => (
              <span key={m.id} className="chip-info">
                {m.nombre}: <strong>{cop(m.total)}</strong>
              </span>
            ))}
          </div>
        )}
        {top.length > 0 && (
          <div className="tarjeta lista-simple">
            <h3>Lo más vendido</h3>
            <ol>
              {top.map(([nombre, cant]) => (
                <li key={nombre}>
                  <span>{nombre}</span>
                  <span className="sutil">{cant} und.</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section className="seccion">
        <div className="seccion-cabeza">
          <h2>Apartados</h2>
          <Link to="/apartados" className="enlace">
            Ver todos
          </Link>
        </div>
        <div className="datos">
          <Dato etiqueta="Activos" valor={num(aps.length)} />
          <Dato etiqueta="Anticipos recibidos" valor={cop(anticipos)} nota="Se devuelven si no completan" />
          <Dato etiqueta="Saldo por cobrar" valor={cop(porCobrar)} />
        </div>
        {(vencidos > 0 || porVencer > 0) && (
          <Link to="/apartados" className="alerta-linea">
            <Icono nombre="reloj" />
            {vencidos > 0 && <span>{vencidos} vencido{vencidos === 1 ? '' : 's'}</span>}
            {vencidos > 0 && porVencer > 0 && <span>·</span>}
            {porVencer > 0 && <span>{porVencer} vence{porVencer === 1 ? '' : 'n'} en 3 días o menos</span>}
          </Link>
        )}
      </section>

      <section className="seccion">
        <div className="seccion-cabeza">
          <h2>Inventario actual</h2>
          <Link to="/productos" className="enlace">
            Ver productos
          </Link>
        </div>
        <div className="datos">
          <Dato etiqueta="Prendas en tienda" valor={num(unidades)} nota="Incluye las apartadas" />
          <Dato etiqueta="Valor a costo" valor={cop(valorCosto)} nota="Lo que invertiste" />
          <Dato etiqueta="Valor a precio de venta" valor={cop(valorVenta)} />
          <Dato
            etiqueta="Ganancia si vendes todo"
            valor={cop(valorVenta - valorCosto)}
            tono="bien"
            nota={valorVenta ? `${Math.round(((valorVenta - valorCosto) / valorVenta) * 100)}% de margen` : undefined}
          />
        </div>
      </section>

      {bajos.length > 0 && (
        <section className="seccion">
          <div className="seccion-cabeza">
            <h2>
              <Icono nombre="alerta" className="icono-aviso" /> Poco stock
            </h2>
            <span className="sutil">{ajustes.stock_minimo} o menos disponibles</span>
          </div>
          <ul className="tarjeta lista-stock">
            {bajos.slice(0, 12).map((i) => (
              <li key={i.id}>
                <Link to={`/productos/${i.producto_id}`}>
                  <Foto ruta={i.fotos[0]} alt={i.nombre} className="foto-sm" />
                  <span className="resultado-texto">
                    <strong>{i.nombre}</strong>
                    <span className="sutil">{varianteTexto(i.talla, i.color) || 'Única'}</span>
                  </span>
                  <span className={`etiqueta ${i.disponible === 0 ? 'etiqueta-mal' : 'etiqueta-aviso'}`}>
                    {i.disponible === 0 ? 'Agotado' : `Quedan ${i.disponible}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {bajos.length > 12 && <p className="sutil">y {bajos.length - 12} más…</p>}
        </section>
      )}
    </div>
  )
}
