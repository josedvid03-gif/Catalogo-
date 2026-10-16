import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { useAjustes } from '../lib/sesion'
import { cop, diasHasta, enlaceWhatsapp, fecha } from '../lib/format'
import type { Apartado, EstadoApartado, MetodoPago } from '../lib/types'
import { BotonAccion, CajaError, Cargando, Hoja, Total, Vacio } from '../components/Comunes'
import { SelectorMetodo, nombreMetodo } from '../components/MetodoPago'
import { Icono } from '../components/Icono'
import { textoComprobante } from './NuevoApartado'

const PESTANAS: { id: EstadoApartado; nombre: string }[] = [
  { id: 'activo', nombre: 'Activos' },
  { id: 'completado', nombre: 'Entregados' },
  { id: 'cancelado', nombre: 'Cancelados' },
]

type Accion = { tipo: 'completar' | 'cancelar' | 'extender'; apartado: Apartado } | null

export function Apartados() {
  const avisar = useAvisar()
  const ajustes = useAjustes()
  const [estado, setEstado] = useState<EstadoApartado>('activo')
  const [accion, setAccion] = useState<Accion>(null)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [devuelto, setDevuelto] = useState(true)

  const carga = useCarga(async () => {
    let q = supabase.from('apartados').select('*, apartado_items(*)').eq('estado', estado)
    q = estado === 'activo' ? q.order('fecha_limite') : q.order('fecha_cierre', { ascending: false }).limit(100)
    return datos(await q) as Apartado[]
  }, [estado])

  const cerrar = useCallback(() => setAccion(null), [])

  const ejecutar = async (fn: () => PromiseLike<{ error: unknown; data: unknown }>, ok: string) => {
    try {
      datos(await fn())
      avisar(ok)
      setAccion(null)
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const lista = carga.data ?? []
  const vencidos = estado === 'activo' ? lista.filter((a) => diasHasta(a.fecha_limite) < 0) : []

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Apartados</h1>
        <div className="acciones">
          <Link to="/apartados/nuevo" className="btn btn-primario">
            <Icono nombre="mas" /> Nuevo
          </Link>
        </div>
      </div>

      <div className="pestanas" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={estado === p.id}
            className={estado === p.id ? 'activa' : ''}
            onClick={() => setEstado(p.id)}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}

      {vencidos.length > 0 && (
        <div className="alerta-linea">
          <Icono nombre="alerta" />
          {vencidos.length} apartado{vencidos.length === 1 ? '' : 's'} vencido{vencidos.length === 1 ? '' : 's'}:
          cancélalo y devuelve el anticipo, o extiende el plazo.
        </div>
      )}

      {carga.data && lista.length === 0 && (
        <Vacio icono="apartados">
          {estado === 'activo' ? 'No hay apartados activos.' : 'No hay apartados en esta lista.'}
        </Vacio>
      )}

      <div className="lista-tarjetas">
        {lista.map((a) => {
          const dias = diasHasta(a.fecha_limite)
          const saldo = a.total - a.anticipo
          return (
            <article key={a.id} className={`tarjeta apartado ${a.estado === 'activo' && dias < 0 ? 'vencido' : ''}`}>
              <div className="apartado-cabeza">
                <div>
                  <strong className="apartado-cliente">{a.cliente}</strong>
                  <span className="sutil"> · #{a.numero}</span>
                </div>
                {a.estado === 'activo' ? (
                  <span
                    className={`etiqueta ${dias < 0 ? 'etiqueta-mal' : dias <= 3 ? 'etiqueta-aviso' : 'etiqueta-bien'}`}
                  >
                    {dias < 0
                      ? `Vencido hace ${-dias} día${dias === -1 ? '' : 's'}`
                      : dias === 0
                        ? 'Vence hoy'
                        : `${dias} día${dias === 1 ? '' : 's'}`}
                  </span>
                ) : a.estado === 'completado' ? (
                  <span className="etiqueta etiqueta-bien">Entregado</span>
                ) : (
                  <span className="etiqueta">{a.anticipo_devuelto ? 'Anticipo devuelto' : 'Cancelado'}</span>
                )}
              </div>
              <ul className="apartado-items">
                {a.apartado_items.map((i) => (
                  <li key={i.id}>
                    <span>
                      {i.cantidad > 1 && `${i.cantidad} × `}
                      {i.descripcion}
                    </span>
                    <span className="sutil">{cop(i.precio_unit * i.cantidad)}</span>
                  </li>
                ))}
              </ul>
              <div className="apartado-montos">
                <div>
                  <span className="sutil">Total</span>
                  <strong>{cop(a.total)}</strong>
                </div>
                <div>
                  <span className="sutil">Anticipo</span>
                  <strong>{cop(a.anticipo)}</strong>
                </div>
                <div>
                  <span className="sutil">Saldo</span>
                  <strong>{cop(saldo)}</strong>
                </div>
              </div>
              <p className="sutil apartado-fechas">
                Apartado el {fecha(a.fecha)} · {a.estado === 'activo' ? 'Límite' : 'Límite era'} {fecha(a.fecha_limite)}
                {a.fecha_cierre && a.estado !== 'activo' && ` · Cerrado el ${fecha(a.fecha_cierre)}`}
                {a.nota && ` · ${a.nota}`}
              </p>
              {a.telefono && (
                <div className="apartado-contacto">
                  <a className="btn btn-sm" href={`tel:${a.telefono}`}>
                    <Icono nombre="telefono" tam={16} /> {a.telefono}
                  </a>
                  <a
                    className="btn btn-sm"
                    href={enlaceWhatsapp(a.telefono, textoComprobante(a, ajustes.nombre_tienda))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icono nombre="chat" tam={16} /> WhatsApp
                  </a>
                </div>
              )}
              {a.estado === 'activo' && (
                <div className="apartado-acciones">
                  <button
                    className="btn btn-primario"
                    onClick={() => {
                      setMetodo('efectivo')
                      setAccion({ tipo: 'completar', apartado: a })
                    }}
                  >
                    Entregar · cobrar {cop(saldo)}
                  </button>
                  <button className="btn" onClick={() => setAccion({ tipo: 'extender', apartado: a })}>
                    Extender
                  </button>
                  <button
                    className="btn btn-peligro-suave"
                    onClick={() => {
                      setDevuelto(true)
                      setAccion({ tipo: 'cancelar', apartado: a })
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <Hoja titulo="Entregar apartado" abierta={accion?.tipo === 'completar'} onCerrar={cerrar}>
        {accion && (
          <>
            <p>
              {accion.apartado.cliente} paga el saldo y se lleva las prendas. Se registra como venta por el total.
            </p>
            <Total etiqueta="Total" valor={accion.apartado.total} />
            <Total
              etiqueta={`Anticipo (${nombreMetodo(accion.apartado.metodo_pago_anticipo)})`}
              valor={accion.apartado.anticipo}
            />
            <Total etiqueta="Cobrar ahora" valor={accion.apartado.total - accion.apartado.anticipo} fuerte />
            <div className="campo">
              <span>¿Cómo paga el saldo?</span>
              <SelectorMetodo valor={metodo} onChange={setMetodo} />
            </div>
            <BotonAccion
              className="btn btn-primario btn-bloque"
              onClick={() =>
                ejecutar(
                  () => supabase.rpc('completar_apartado', { p_apartado: accion.apartado.id, p_metodo: metodo }),
                  'Apartado entregado y registrado como venta',
                )
              }
            >
              Confirmar entrega
            </BotonAccion>
          </>
        )}
      </Hoja>

      <Hoja titulo="Cancelar apartado" abierta={accion?.tipo === 'cancelar'} onCerrar={cerrar}>
        {accion && (
          <>
            <p>Las prendas vuelven a estar disponibles para la venta.</p>
            <Total etiqueta="Anticipo a devolver" valor={accion.apartado.anticipo} fuerte />
            <label className="interruptor">
              <input type="checkbox" checked={devuelto} onChange={(e) => setDevuelto(e.target.checked)} />
              <span>Ya le devolví el anticipo a {accion.apartado.cliente}</span>
            </label>
            <BotonAccion
              className="btn btn-peligro btn-bloque"
              onClick={() =>
                ejecutar(
                  () =>
                    supabase.rpc('cancelar_apartado', { p_apartado: accion.apartado.id, p_devolver: devuelto }),
                  'Apartado cancelado',
                )
              }
            >
              Cancelar apartado
            </BotonAccion>
          </>
        )}
      </Hoja>

      <Hoja titulo="Extender plazo" abierta={accion?.tipo === 'extender'} onCerrar={cerrar}>
        {accion && (
          <>
            <p>
              Límite actual: <strong>{fecha(accion.apartado.fecha_limite)}</strong>. ¿Cuántos días más?
            </p>
            <div className="chips">
              {[7, 15, 30].map((d) => (
                <BotonAccion
                  key={d}
                  className="chip"
                  onClick={() =>
                    ejecutar(
                      () => supabase.rpc('extender_apartado', { p_apartado: accion.apartado.id, p_dias: d }),
                      `Plazo extendido ${d} días`,
                    )
                  }
                >
                  +{d} días
                </BotonAccion>
              ))}
            </div>
          </>
        )}
      </Hoja>
    </div>
  )
}
