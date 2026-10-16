import { useMemo, useState } from 'react'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { useSesion } from '../lib/sesion'
import { cop, enlaceWhatsapp, fechaHora, hoyColombia } from '../lib/format'
import { vincularCliente } from '../lib/clientes'
import { BotonAccion, CajaError, Cargando, Dato, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'

type Estado = 'nuevo' | 'atendido' | 'vendido' | 'descartado'

interface Contacto {
  id: string
  created_at: string
  tipo: 'pedido' | 'pregunta' | 'general'
  asesor_id: string | null
  asesor_nombre: string | null
  whatsapp_destino: string | null
  mensaje: string | null
  producto_nombre: string | null
  total: number | null
  cliente_nombre: string | null
  cliente_celular: string | null
  cliente_cedula: string | null
  cliente_ciudad: string | null
  cliente_direccion: string | null
  entrega: string | null
  estado: Estado
  nota: string | null
  atendido_por: string | null
  actualizado_at: string | null
}

const ESTADOS: { id: Estado; nombre: string; clase: string }[] = [
  { id: 'nuevo', nombre: 'Nuevo', clase: 'etiqueta-aviso' },
  { id: 'atendido', nombre: 'Atendido', clase: '' },
  { id: 'vendido', nombre: 'Vendido', clase: 'etiqueta-bien' },
  { id: 'descartado', nombre: 'Descartado', clase: '' },
]
const TIPO: Record<Contacto['tipo'], string> = { pedido: 'Pedido', pregunta: 'Pregunta', general: 'Mensaje' }
const PERIODOS = [
  { dias: 1, nombre: 'Hoy' },
  { dias: 7, nombre: '7 días' },
  { dias: 30, nombre: '30 días' },
  { dias: 90, nombre: '90 días' },
]

function desdeDias(dias: number): string {
  const d = new Date(hoyColombia() + 'T00:00:00-05:00')
  d.setDate(d.getDate() - (dias - 1))
  return d.toISOString()
}

export function Mensajes() {
  const avisar = useAvisar()
  const { session } = useSesion()
  const [dias, setDias] = useState(7)
  const [estado, setEstado] = useState<Estado | 'todos'>('nuevo')
  const [asesor, setAsesor] = useState('')

  const carga = useCarga(
    async () =>
      datos(
        await supabase
          .from('contactos')
          .select('*')
          .gte('created_at', desdeDias(dias))
          .order('created_at', { ascending: false })
          .limit(1000),
      ) as Contacto[],
    [dias],
  )

  const todos = carga.data ?? []
  const nombreAsesor = (c: Contacto) => c.asesor_nombre ?? 'WhatsApp de la tienda'

  const porAsesor = useMemo(() => {
    const m = new Map<string, { total: number; pedidos: number; atendidos: number; vendidos: number; nuevos: number; valor: number }>()
    for (const c of todos) {
      const k = nombreAsesor(c)
      const x = m.get(k) ?? { total: 0, pedidos: 0, atendidos: 0, vendidos: 0, nuevos: 0, valor: 0 }
      x.total++
      if (c.tipo === 'pedido') x.pedidos++
      if (c.estado === 'atendido') x.atendidos++
      if (c.estado === 'vendido') {
        x.vendidos++
        x.valor += c.total ?? 0
      }
      if (c.estado === 'nuevo') x.nuevos++
      m.set(k, x)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [todos])

  const visibles = todos.filter(
    (c) => (estado === 'todos' || c.estado === estado) && (!asesor || nombreAsesor(c) === asesor),
  )
  const nuevos = todos.filter((c) => c.estado === 'nuevo').length
  const pedidos = todos.filter((c) => c.tipo === 'pedido').length
  const vendidos = todos.filter((c) => c.estado === 'vendido').length

  const actualizar = async (c: Contacto, cambios: Partial<Contacto>) => {
    try {
      datos(
        await supabase
          .from('contactos')
          .update({ ...cambios, atendido_por: session?.user.email ?? null, actualizado_at: new Date().toISOString() })
          .eq('id', c.id),
      )
      await carga.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const guardarCliente = async (c: Contacto) => {
    try {
      const id = await vincularCliente({ clienteId: null, nombre: c.cliente_nombre ?? '', telefono: c.cliente_celular ?? '' })
      if (!id) return avisar('Falta nombre o celular del cliente', 'error')
      avisar('Guardado en Clientes')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Mensajes</h1>
      </div>
      <p className="sutil">
        Cada vez que un cliente toca un botón de WhatsApp en el catálogo queda aquí, con el asesor que le tocó. La
        conversación en sí está en WhatsApp.
      </p>

      <div className="chips">
        {PERIODOS.map((p) => (
          <button key={p.dias} className={`chip ${dias === p.dias ? 'chip-activo' : ''}`} onClick={() => setDias(p.dias)}>
            {p.nombre}
          </button>
        ))}
      </div>

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}

      {carga.data && (
        <>
          <div className="datos">
            <Dato etiqueta="Mensajes" valor={String(todos.length)} nota={`${pedidos} pedido${pedidos === 1 ? '' : 's'}`} />
            <Dato etiqueta="Sin atender" valor={String(nuevos)} tono={nuevos ? 'mal' : undefined} />
            <Dato
              etiqueta="Terminaron en venta"
              valor={String(vendidos)}
              tono="bien"
              nota={todos.length ? `${Math.round((vendidos / todos.length) * 100)}% de los mensajes` : undefined}
            />
          </div>

          {porAsesor.length > 0 && (
            <section className="tarjeta">
              <h2>Por asesor</h2>
              <div className="tabla-scroll">
                <table className="tabla-caja">
                  <thead>
                    <tr>
                      <th />
                      <th>Recibidos</th>
                      <th>Sin atender</th>
                      <th>Vendidos</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porAsesor.map(([nombre, x]) => (
                      <tr key={nombre}>
                        <th>{nombre}</th>
                        <td>
                          {x.total}
                          {x.pedidos > 0 && <span className="sutil"> ({x.pedidos} ped.)</span>}
                        </td>
                        <td className={x.nuevos ? 'tono-mal' : ''}>{x.nuevos}</td>
                        <td>{x.vendidos}</td>
                        <td>{cop(x.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="pestanas" role="tablist">
            {[{ id: 'nuevo', nombre: `Nuevos${nuevos ? ` (${nuevos})` : ''}` }, { id: 'todos', nombre: 'Todos' }, { id: 'vendido', nombre: 'Vendidos' }].map(
              (p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={estado === p.id}
                  className={estado === p.id ? 'activa' : ''}
                  onClick={() => setEstado(p.id as Estado | 'todos')}
                >
                  {p.nombre}
                </button>
              ),
            )}
          </div>
          {porAsesor.length > 1 && (
            <select value={asesor} onChange={(e) => setAsesor(e.target.value)} aria-label="Asesor">
              <option value="">Todos los asesores</option>
              {porAsesor.map(([n]) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}

          {visibles.length === 0 ? (
            <Vacio icono="ventas">{estado === 'nuevo' ? 'No hay mensajes sin atender. 👌' : 'No hay mensajes en este periodo.'}</Vacio>
          ) : (
            <div className="lista-tarjetas">
              {visibles.map((c) => {
                const est = ESTADOS.find((e) => e.id === c.estado)!
                return (
                  <article key={c.id} className={`tarjeta mensaje ${c.estado === 'nuevo' ? 'mensaje-nuevo' : ''}`}>
                    <div className="apartado-cabeza">
                      <div>
                        <strong>
                          {TIPO[c.tipo]}
                          {c.total ? ` · ${cop(c.total)}` : ''}
                        </strong>
                        <div className="sutil">
                          {fechaHora(c.created_at)} · para {nombreAsesor(c)}
                        </div>
                      </div>
                      <span className={`etiqueta ${est.clase}`}>{est.nombre}</span>
                    </div>

                    {c.producto_nombre && <p>👕 {c.producto_nombre}</p>}
                    {(c.cliente_nombre || c.cliente_celular) && (
                      <div className="mensaje-cliente">
                        <strong>{c.cliente_nombre}</strong>
                        <span className="sutil">
                          {[c.cliente_celular, c.cliente_cedula && `CC ${c.cliente_cedula}`].filter(Boolean).join(' · ')}
                        </span>
                        {c.entrega === 'recoger' ? (
                          <span className="sutil">Recoge en persona</span>
                        ) : (
                          (c.cliente_ciudad || c.cliente_direccion) && (
                            <span className="sutil">📦 {[c.cliente_ciudad, c.cliente_direccion].filter(Boolean).join(' · ')}</span>
                          )
                        )}
                      </div>
                    )}
                    {c.mensaje && (
                      <details className="mensaje-texto">
                        <summary>Ver mensaje</summary>
                        <p>{c.mensaje}</p>
                      </details>
                    )}

                    <div className="chips">
                      {ESTADOS.filter((e) => e.id !== 'nuevo').map((e) => (
                        <BotonAccion
                          key={e.id}
                          className={`chip ${c.estado === e.id ? 'chip-activo' : ''}`}
                          onClick={() => actualizar(c, { estado: c.estado === e.id ? 'nuevo' : e.id })}
                        >
                          {e.nombre}
                        </BotonAccion>
                      ))}
                    </div>
                    <input
                      className="mensaje-nota"
                      placeholder="Nota (ej: pidió talla M, pagó por Nequi…)"
                      defaultValue={c.nota ?? ''}
                      onBlur={(e) => {
                        if ((e.target.value || null) !== c.nota) void actualizar(c, { nota: e.target.value.trim() || null })
                      }}
                    />
                    <div className="apartado-contacto">
                      {c.cliente_celular && (
                        <a
                          className="btn btn-sm"
                          href={enlaceWhatsapp(c.cliente_celular, `Hola ${c.cliente_nombre?.split(' ')[0] ?? ''} 👋`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icono nombre="chat" tam={16} /> Escribirle
                        </a>
                      )}
                      {c.cliente_celular && c.cliente_nombre && (
                        <BotonAccion className="btn btn-sm" onClick={() => guardarCliente(c)}>
                          <Icono nombre="clientes" tam={16} /> Guardar cliente
                        </BotonAccion>
                      )}
                    </div>
                    {c.atendido_por && c.actualizado_at && (
                      <p className="sutil">
                        Actualizado por {c.atendido_por.split('@')[0]} · {fechaHora(c.actualizado_at)}
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Cantidad de mensajes sin atender (0 si aún no existe la tabla). */
export async function contarMensajesNuevos(): Promise<number> {
  const r = await supabase.from('contactos').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo')
  return r.error ? 0 : (r.count ?? 0)
}
