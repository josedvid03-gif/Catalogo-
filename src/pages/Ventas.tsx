import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { cop, fechaHora, mesActual, moverMes, nombreMes, rangoMes } from '../lib/format'
import type { Venta } from '../lib/types'
import { BotonAccion, CajaError, Cargando, Dato, Hoja, Total, Vacio } from '../components/Comunes'
import { nombreMetodo } from '../components/MetodoPago'
import { Icono } from '../components/Icono'

export function Ventas() {
  const avisar = useAvisar()
  const [mes, setMes] = useState(mesActual())
  const [detalle, setDetalle] = useState<Venta | null>(null)

  const carga = useCarga(async () => {
    const { desde, hasta } = rangoMes(mes)
    return datos(
      await supabase
        .from('ventas')
        .select('*, venta_items(*)')
        .gte('fecha', desde)
        .lt('fecha', hasta)
        .order('fecha', { ascending: false }),
    ) as Venta[]
  }, [mes])

  const cerrar = useCallback(() => setDetalle(null), [])

  const ventas = carga.data ?? []
  const validas = ventas.filter((v) => !v.anulada)
  const total = validas.reduce((s, v) => s + v.total, 0)
  const ganancia = validas.reduce((s, v) => s + v.total - v.costo_total, 0)
  const prendas = validas.reduce((s, v) => s + v.venta_items.reduce((x, i) => x + i.cantidad, 0), 0)

  // Agrupar por día
  const dias = new Map<string, Venta[]>()
  for (const v of ventas) {
    const dia = new Date(v.fecha).toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Bogota',
    })
    dias.set(dia, [...(dias.get(dia) ?? []), v])
  }

  const anular = async (v: Venta) => {
    if (!confirm(`¿Anular la venta #${v.numero}? Las prendas vuelven al inventario.`)) return
    try {
      datos(await supabase.rpc('anular_venta', { p_venta: v.id }))
      avisar(`Venta #${v.numero} anulada`)
      setDetalle(null)
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Ventas</h1>
        <div className="acciones">
          <Link to="/vender" className="btn btn-primario">
            <Icono nombre="mas" /> Vender
          </Link>
        </div>
      </div>

      <div className="selector-mes selector-mes-grande">
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

      <div className="datos">
        <Dato etiqueta="Vendido" valor={cop(total)} nota={`${validas.length} ventas · ${prendas} prendas`} />
        <Dato etiqueta="Ganancia" valor={cop(ganancia)} tono={ganancia >= 0 ? 'bien' : 'mal'} />
      </div>

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}
      {carga.data && ventas.length === 0 && <Vacio icono="ventas">No hay ventas en {nombreMes(mes).toLowerCase()}.</Vacio>}

      {[...dias.entries()].map(([dia, vs]) => (
        <section key={dia} className="seccion">
          <h3 className="dia">{dia}</h3>
          <ul className="tarjeta lista-ventas">
            {vs.map((v) => (
              <li key={v.id}>
                <button className={`venta-fila ${v.anulada ? 'anulada' : ''}`} onClick={() => setDetalle(v)}>
                  <span className="venta-texto">
                    <strong>
                      #{v.numero} {v.cliente ? `· ${v.cliente}` : ''}
                    </strong>
                    <span className="sutil">
                      {v.venta_items.map((i) => (i.cantidad > 1 ? `${i.cantidad}× ` : '') + i.descripcion).join(', ')}
                    </span>
                  </span>
                  <span className="venta-lado">
                    <strong>{cop(v.total)}</strong>
                    <span className="sutil">{v.anulada ? 'Anulada' : nombreMetodo(v.metodo_pago)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Hoja titulo={detalle ? `Venta #${detalle.numero}` : ''} abierta={!!detalle} onCerrar={cerrar}>
        {detalle && (
          <>
            <p className="sutil">
              {fechaHora(detalle.fecha)} · {nombreMetodo(detalle.metodo_pago)}
              {detalle.cliente && ` · ${detalle.cliente}`}
              {detalle.creado_por && ` · registró ${detalle.creado_por.split('@')[0]}`}
            </p>
            {detalle.nota && <p>{detalle.nota}</p>}
            <ul className="apartado-items">
              {detalle.venta_items.map((i) => (
                <li key={i.id}>
                  <span>
                    {i.cantidad} × {i.descripcion}
                  </span>
                  <span>{cop(i.precio_unit * i.cantidad)}</span>
                </li>
              ))}
            </ul>
            <Total etiqueta="Total" valor={detalle.total} fuerte />
            <Total etiqueta="Costo" valor={detalle.costo_total} />
            <Total etiqueta="Ganancia" valor={detalle.total - detalle.costo_total} />
            {detalle.anulada ? (
              <p className="etiqueta etiqueta-mal">Venta anulada</p>
            ) : (
              <BotonAccion className="btn btn-peligro-suave btn-bloque" onClick={() => anular(detalle)}>
                Anular venta (error o devolución)
              </BotonAccion>
            )}
          </>
        )}
      </Hoja>
    </div>
  )
}
