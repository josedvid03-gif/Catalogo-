import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { useAjustes } from '../lib/sesion'
import { cop, enlaceWhatsapp, fecha, varianteTexto } from '../lib/format'
import { motivosInteres, tallasDe, urlPrenda } from '../lib/clientes'
import type { Cliente } from '../lib/types'
import { BotonAccion, CajaError, Cargando, Dato, Foto, Hoja, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'
import { nombreMetodo } from '../components/MetodoPago'
import type { MetodoPago } from '../lib/types'

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

interface Resumen {
  compras: number
  total: number
  ultima: string | null
}

/* ------------------------------------------------------------------ */
/*  Lista                                                              */
/* ------------------------------------------------------------------ */

export function Clientes() {
  const navegar = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const cerrar = useCallback(() => setNuevo(false), [])

  const carga = useCarga(async () => {
    const [cs, vs] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('ventas').select('cliente_id, total, fecha').eq('anulada', false).not('cliente_id', 'is', null),
    ])
    const clientes = datos(cs) as Cliente[]
    const ventas = datos(vs) as { cliente_id: string; total: number; fecha: string }[]
    const resumen = new Map<string, Resumen>()
    for (const v of ventas) {
      const r = resumen.get(v.cliente_id) ?? { compras: 0, total: 0, ultima: null }
      r.compras++
      r.total += v.total
      if (!r.ultima || v.fecha > r.ultima) r.ultima = v.fecha
      resumen.set(v.cliente_id, r)
    }
    return { clientes, resumen }
  })

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const lista = carga.data?.clientes ?? []
    if (!q) return lista
    return lista.filter((c) =>
      normalizar(`${c.nombre} ${c.telefono ?? ''} ${c.instagram ?? ''} ${c.tallas ?? ''} ${c.intereses ?? ''}`).includes(q),
    )
  }, [busqueda, carga.data])

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Clientes</h1>
        <div className="acciones">
          <button className="btn btn-primario" onClick={() => setNuevo(true)}>
            <Icono nombre="mas" /> Nuevo
          </button>
        </div>
      </div>

      <div className="buscador">
        <Icono nombre="buscar" />
        <input
          type="search"
          placeholder="Buscar por nombre, celular, talla…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar cliente"
        />
      </div>

      {carga.error && <CajaError mensaje={carga.error} reintentar={carga.recargar} />}
      {carga.cargando && !carga.data && <Cargando />}
      {carga.data && visibles.length === 0 && (
        <Vacio icono="prendas">
          {carga.data.clientes.length === 0
            ? 'Aún no hay clientes. Se guardan solos cuando vendes o apartas escribiendo el celular, o puedes crearlos aquí.'
            : 'No hay clientes con esa búsqueda.'}
        </Vacio>
      )}

      <ul className="tarjeta lista-ventas">
        {visibles.map((c) => {
          const r = carga.data?.resumen.get(c.id)
          return (
            <li key={c.id}>
              <Link to={`/clientes/${c.id}`} className="venta-fila">
                <span className="avatar">{c.nombre.trim().charAt(0).toUpperCase()}</span>
                <span className="venta-texto">
                  <strong>{c.nombre}</strong>
                  <span className="sutil">
                    {[c.telefono, c.tallas && `talla ${c.tallas}`].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </span>
                </span>
                <span className="venta-lado">
                  <strong>{r ? cop(r.total) : '—'}</strong>
                  <span className="sutil">
                    {r ? `${r.compras} compra${r.compras === 1 ? '' : 's'}` : 'Sin compras'}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <Hoja titulo="Nuevo cliente" abierta={nuevo} onCerrar={cerrar}>
        {nuevo && (
          <FormCliente
            onGuardado={(id) => {
              setNuevo(false)
              navegar(`/clientes/${id}`)
            }}
          />
        )}
      </Hoja>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Formulario                                                         */
/* ------------------------------------------------------------------ */

function FormCliente({ cliente, onGuardado }: { cliente?: Cliente; onGuardado: (id: string) => void }) {
  const avisar = useAvisar()
  const [f, setF] = useState({
    nombre: cliente?.nombre ?? '',
    telefono: cliente?.telefono ?? '',
    instagram: cliente?.instagram ?? '',
    tallas: cliente?.tallas ?? '',
    intereses: cliente?.intereses ?? '',
    notas: cliente?.notas ?? '',
    avisar: cliente?.avisar ?? true,
  })

  const guardar = async () => {
    if (!f.nombre.trim()) return avisar('Escribe el nombre', 'error')
    const fila = {
      nombre: f.nombre.trim(),
      telefono: f.telefono.trim() || null,
      instagram: f.instagram.trim().replace(/^@/, '') || null,
      tallas: tallasDe(f.tallas).join(', ') || null,
      intereses: f.intereses.trim() || null,
      notas: f.notas.trim() || null,
      avisar: f.avisar,
    }
    try {
      if (cliente) {
        datos(await supabase.from('clientes').update(fila).eq('id', cliente.id))
        avisar('Cliente actualizado')
        onGuardado(cliente.id)
      } else {
        const r = datos(await supabase.from('clientes').insert(fila).select('id').single()) as { id: string }
        avisar('Cliente creado')
        onGuardado(r.id)
      }
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const campo = (k: keyof typeof f, etiqueta: string, extra: Record<string, string> = {}) => (
    <label className="campo">
      <span>{etiqueta}</span>
      <input value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
    </label>
  )

  return (
    <>
      {campo('nombre', 'Nombre *')}
      <div className="dos-columnas">
        {campo('telefono', 'Celular', { type: 'tel', inputMode: 'tel', placeholder: '300 123 4567' })}
        {campo('instagram', 'Instagram', { placeholder: 'usuario' })}
      </div>
      {campo('tallas', 'Tallas que usa', { placeholder: 'Ej: S, M, 32' })}
      {campo('intereses', 'Le gusta', { placeholder: 'Ej: Nike, buzos, jeans' })}
      {campo('notas', 'Notas', { placeholder: 'Ej: prefiere colores oscuros' })}
      <label className="interruptor">
        <input type="checkbox" checked={f.avisar} onChange={(e) => setF({ ...f, avisar: e.target.checked })} />
        <span>Avisarle cuando llegue algo de su talla</span>
      </label>
      <BotonAccion className="btn btn-primario btn-bloque" onClick={guardar}>
        {cliente ? 'Guardar cambios' : 'Crear cliente'}
      </BotonAccion>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Detalle                                                            */
/* ------------------------------------------------------------------ */

interface CompraCliente {
  id: string
  numero: number
  fecha: string
  total: number
  metodo_pago: MetodoPago
  venta_items: { id: string; descripcion: string; cantidad: number; precio_unit: number }[]
}

interface Novedad {
  id: string
  nombre: string
  precio: number
  marca: string | null
  categoria: string | null
  fotos: string[]
  tallas: string[]
  motivos: string[]
}

export function ClienteDetalle() {
  const { id } = useParams()
  const navegar = useNavigate()
  const avisar = useAvisar()
  const ajustes = useAjustes()
  const [editando, setEditando] = useState(false)
  const cerrar = useCallback(() => setEditando(false), [])

  const carga = useCarga(async () => {
    const [c, vs, aps, inv] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id!).single(),
      supabase
        .from('ventas')
        .select('id, numero, fecha, total, metodo_pago, venta_items(id, descripcion, cantidad, precio_unit)')
        .eq('cliente_id', id!)
        .eq('anulada', false)
        .order('fecha', { ascending: false }),
      supabase
        .from('apartados')
        .select('id, numero, fecha, total, anticipo, estado, fecha_limite')
        .eq('cliente_id', id!)
        .order('fecha', { ascending: false }),
      supabase
        .from('inventario')
        .select('producto_id, talla, disponible, nombre, precio, fotos, activo, publicado')
        .eq('activo', true)
        .gt('disponible', 0),
    ])
    const cliente = datos(c) as Cliente
    const items = datos(inv) as {
      producto_id: string
      talla: string
      nombre: string
      precio: number
      fotos: string[]
    }[]
    // Novedades: prendas disponibles en sus tallas o de sus marcas/categorías favoritas.
    const productos = datos(
      await supabase
        .from('productos')
        .select('id, nombre, precio, marca, categoria, fotos, created_at')
        .eq('activo', true)
        .order('created_at', { ascending: false }),
    ) as Omit<Novedad, 'tallas' | 'motivos'>[]
    const novedades: Novedad[] = []
    for (const p of productos) {
      const tallas = items.filter((i) => i.producto_id === p.id).map((i) => i.talla)
      if (!tallas.length) continue
      const motivos = motivosInteres(cliente, { tallas, marca: p.marca, categoria: p.categoria })
      if (motivos.length) novedades.push({ ...p, tallas, motivos })
    }
    return {
      cliente,
      compras: datos(vs) as CompraCliente[],
      apartados: datos(aps) as {
        id: string
        numero: number
        fecha: string
        total: number
        anticipo: number
        estado: string
        fecha_limite: string
      }[],
      novedades: novedades.slice(0, 12),
    }
  }, [id])

  const [elegidas, setElegidas] = useState<string[]>([])
  useEffect(() => setElegidas([]), [id])

  if (carga.error) return <CajaError mensaje={carga.error} reintentar={carga.recargar} />
  if (!carga.data) return <Cargando />
  const { cliente, compras, apartados, novedades } = carga.data
  const total = compras.reduce((s, v) => s + v.total, 0)
  const prendas = compras.reduce((s, v) => s + v.venta_items.reduce((x, i) => x + i.cantidad, 0), 0)

  const mensajeNovedades = () => {
    const lista = novedades.filter((n) => elegidas.includes(n.id))
    return [
      `Hola ${cliente.nombre.split(' ')[0]} 👋, te escribimos de ${ajustes.nombre_tienda}.`,
      `Llegaron prendas que te pueden gustar:`,
      ...lista.map((n) => `• ${n.nombre} (talla ${n.tallas.join('/')}) — ${cop(n.precio)}\n  ${urlPrenda(n.id)}`),
      ``,
      `Si te interesa alguna, te la separamos.`,
    ].join('\n')
  }

  const eliminar = async () => {
    if (!confirm(`¿Eliminar a ${cliente.nombre}? Sus compras se conservan, pero sin nombre de cliente.`)) return
    try {
      datos(await supabase.from('clientes').delete().eq('id', cliente.id))
      avisar('Cliente eliminado')
      navegar('/clientes', { replace: true })
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <Link to="/clientes" className="btn-icono" aria-label="Volver">
          <Icono nombre="atras" />
        </Link>
        <h1>{cliente.nombre}</h1>
        <button className="btn btn-sm" onClick={() => setEditando(true)}>
          Editar
        </button>
      </div>

      <div className="apartado-contacto">
        {cliente.telefono && (
          <>
            <a className="btn btn-sm" href={`tel:${cliente.telefono}`}>
              <Icono nombre="telefono" tam={16} /> {cliente.telefono}
            </a>
            <a
              className="btn btn-sm"
              href={enlaceWhatsapp(cliente.telefono, `Hola ${cliente.nombre.split(' ')[0]} 👋`)}
              target="_blank"
              rel="noreferrer"
            >
              <Icono nombre="chat" tam={16} /> WhatsApp
            </a>
          </>
        )}
        {cliente.instagram && (
          <a className="btn btn-sm" href={`https://instagram.com/${cliente.instagram}`} target="_blank" rel="noreferrer">
            <Icono nombre="instagram" tam={16} /> @{cliente.instagram}
          </a>
        )}
      </div>

      <div className="datos">
        <Dato etiqueta="Ha comprado" valor={cop(total)} nota={`${compras.length} compras · ${prendas} prendas`} />
        <Dato etiqueta="Tallas" valor={cliente.tallas || '—'} nota={cliente.intereses ? `Le gusta: ${cliente.intereses}` : undefined} />
        <Dato
          etiqueta="Última compra"
          valor={compras[0] ? fecha(compras[0].fecha) : '—'}
          nota={cliente.avisar ? 'Quiere recibir novedades' : 'No quiere novedades'}
        />
      </div>
      {cliente.notas && <p className="sutil">📝 {cliente.notas}</p>}

      <section className="tarjeta">
        <div className="seccion-cabeza">
          <h2>Le puede interesar</h2>
          <span className="sutil">Según su talla y gustos</span>
        </div>
        {!cliente.tallas && !cliente.intereses ? (
          <p className="sutil">
            Agrega sus tallas o lo que le gusta (botón <em>Editar</em>) para ver aquí las prendas que le sirven.
          </p>
        ) : novedades.length === 0 ? (
          <p className="sutil">No hay prendas disponibles en sus tallas ahora.</p>
        ) : (
          <>
            <ul className="lista-novedades">
              {novedades.map((n) => (
                <li key={n.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={elegidas.includes(n.id)}
                      onChange={(e) =>
                        setElegidas((xs) => (e.target.checked ? [...xs, n.id] : xs.filter((x) => x !== n.id)))
                      }
                    />
                    <Foto ruta={n.fotos[0]} alt={n.nombre} className="foto-sm" />
                    <span className="resultado-texto">
                      <strong>{n.nombre}</strong>
                      <span className="sutil">
                        {cop(n.precio)} · {n.motivos.join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {cliente.telefono ? (
              <a
                className={`btn btn-primario btn-bloque ${elegidas.length ? '' : 'deshabilitado'}`}
                href={elegidas.length ? enlaceWhatsapp(cliente.telefono, mensajeNovedades()) : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!elegidas.length}
              >
                <Icono nombre="chat" /> Enviar {elegidas.length || ''} por WhatsApp
              </a>
            ) : (
              <p className="sutil">Agrega su celular para enviarle las novedades por WhatsApp.</p>
            )}
          </>
        )}
      </section>

      <section className="seccion">
        <h2>Compras</h2>
        {compras.length === 0 ? (
          <p className="sutil">Aún no tiene compras registradas a su nombre.</p>
        ) : (
          <ul className="tarjeta historial lista-caja">
            {compras.map((v) => (
              <li key={v.id}>
                <span className="historial-texto">
                  <strong>
                    #{v.numero} · {fecha(v.fecha)}
                  </strong>
                  <span className="sutil">
                    {v.venta_items.map((i) => (i.cantidad > 1 ? `${i.cantidad}× ` : '') + i.descripcion).join(', ')} ·{' '}
                    {nombreMetodo(v.metodo_pago)}
                  </span>
                </span>
                <strong>{cop(v.total)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {apartados.length > 0 && (
        <section className="seccion">
          <h2>Apartados</h2>
          <ul className="tarjeta historial lista-caja">
            {apartados.map((a) => (
              <li key={a.id}>
                <span className="historial-texto">
                  <strong>
                    #{a.numero} · {fecha(a.fecha)}
                  </strong>
                  <span className="sutil">
                    {a.estado === 'activo'
                      ? `Activo · anticipo ${cop(a.anticipo)} · hasta ${fecha(a.fecha_limite)}`
                      : a.estado === 'completado'
                        ? 'Entregado'
                        : 'Cancelado'}
                  </span>
                </span>
                <strong>{cop(a.total)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tarjeta zona-peligro">
        <BotonAccion className="btn btn-peligro-suave" onClick={eliminar}>
          <Icono nombre="basura" /> Eliminar cliente
        </BotonAccion>
      </section>

      <Hoja titulo="Editar cliente" abierta={editando} onCerrar={cerrar}>
        {editando && (
          <FormCliente
            cliente={cliente}
            onGuardado={() => {
              setEditando(false)
              void carga.recargar()
            }}
          />
        )}
      </Hoja>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  En la ficha de un producto: a quién avisarle                       */
/* ------------------------------------------------------------------ */

export function ClientesInteresados({
  productoId,
  nombre,
  precio,
  marca,
  categoria,
  tallas,
}: {
  productoId: string
  nombre: string
  precio: number
  marca: string
  categoria: string
  tallas: string[]
}) {
  const ajustes = useAjustes()
  const clientes = useCarga(
    async () => {
      const r = await supabase.from('clientes').select('*').eq('avisar', true).not('telefono', 'is', null)
      return r.error ? [] : (r.data as Cliente[])
    },
    [],
    { alVolver: false },
  )
  const interesados = (clientes.data ?? [])
    .map((c) => ({ c, motivos: motivosInteres(c, { tallas, marca, categoria }) }))
    .filter((x) => x.motivos.length)
  if (!tallas.length || !interesados.length) return null

  const mensaje = (c: Cliente) =>
    [
      `Hola ${c.nombre.split(' ')[0]} 👋, te escribimos de ${ajustes.nombre_tienda}.`,
      `Llegó ${nombre}${tallas.length ? ` en talla ${[...new Set(tallas)].map((t) => varianteTexto(t, '')).join('/')}` : ''} por ${cop(precio)}.`,
      `Míralo aquí: ${urlPrenda(productoId)}`,
    ].join('\n')

  return (
    <section className="tarjeta">
      <div className="seccion-cabeza">
        <h2>Avisar a clientes</h2>
        <span className="sutil">
          {interesados.length} interesado{interesados.length === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="historial">
        {interesados.map(({ c, motivos }) => (
          <li key={c.id}>
            <span className="historial-texto">
              <strong>{c.nombre}</strong>
              <span className="sutil">{motivos.join(' · ')}</span>
            </span>
            <a className="btn btn-sm" href={enlaceWhatsapp(c.telefono!, mensaje(c))} target="_blank" rel="noreferrer">
              <Icono nombre="chat" tam={16} /> Avisar
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
