import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, datos, mensajeError, urlFoto } from '../lib/supabase'
import { subirFoto } from '../lib/imagenes'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { fechaHora } from '../lib/format'
import { BotonAccion, CajaError, Cargando, Hoja, Vacio } from '../components/Comunes'
import { Icono } from '../components/Icono'

type Estado = 'pendiente' | 'publicada' | 'oculta'

interface Resena {
  id: string
  created_at: string
  producto_id: string | null
  venta_id: string | null
  nombre: string
  estrellas: number
  texto: string | null
  fotos: string[]
  estado: Estado
  productos: { nombre: string } | null
  ventas: { numero: number } | null
}

const PESTANAS: { id: Estado; nombre: string }[] = [
  { id: 'pendiente', nombre: 'Por aprobar' },
  { id: 'publicada', nombre: 'Publicadas' },
  { id: 'oculta', nombre: 'Ocultas' },
]

const estrellasTexto = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

export function OpinionesEquipo() {
  const avisar = useAvisar()
  const [estado, setEstado] = useState<Estado>('pendiente')
  const [nueva, setNueva] = useState(false)

  const carga = useCarga(
    async () =>
      datos(
        await supabase
          .from('resenas')
          .select('*, productos(nombre), ventas(numero)')
          .eq('estado', estado)
          .order('created_at', { ascending: false })
          .limit(300),
      ) as Resena[],
    [estado],
  )

  const cambiar = async (r: Resena, e: Estado) => {
    try {
      datos(await supabase.from('resenas').update({ estado: e }).eq('id', r.id))
      avisar(e === 'publicada' ? 'Publicada en el catálogo' : e === 'oculta' ? 'Ocultada' : 'Movida a por aprobar')
      await carga.recargar()
    } catch (err) {
      avisar(mensajeError(err), 'error')
    }
  }
  const borrar = async (r: Resena) => {
    if (!confirm(`¿Borrar la opinión de ${r.nombre}?`)) return
    try {
      datos(await supabase.from('resenas').delete().eq('id', r.id))
      await carga.recargar()
    } catch (err) {
      avisar(mensajeError(err), 'error')
    }
  }

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <h1>Opiniones</h1>
        <div className="acciones">
          <button className="btn" onClick={() => setNueva(true)}>
            <Icono nombre="mas" /> Agregar
          </button>
        </div>
      </div>
      <p className="sutil">
        Para pedir una opinión, abre la venta en <Link to="/ventas">Ventas</Link> y toca <strong>Pedir opinión al cliente</strong>
        : le llega un enlace por WhatsApp. Las que vienen de una venta salen como <strong>Compra verificada</strong>. Ninguna se
        publica sin tu aprobación.
      </p>

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
      {carga.data?.length === 0 && (
        <Vacio icono="ventas">
          {estado === 'pendiente' ? 'No hay opiniones por aprobar.' : 'Todavía no hay opiniones aquí.'}
        </Vacio>
      )}

      <div className="lista-tarjetas">
        {carga.data?.map((r) => (
          <article key={r.id} className="tarjeta opinion-equipo">
            <div className="apartado-cabeza">
              <div>
                <strong>{r.nombre}</strong>
                <div className="sutil">
                  {fechaHora(r.created_at)}
                  {r.ventas ? ` · venta #${r.ventas.numero} · Compra verificada` : ' · agregada por el equipo'}
                </div>
              </div>
              <span className="opinion-estrellas" aria-label={`${r.estrellas} estrellas`}>
                {estrellasTexto(r.estrellas)}
              </span>
            </div>
            {r.productos && <p className="sutil">👕 {r.productos.nombre}</p>}
            {r.texto && <p>{r.texto}</p>}
            {r.fotos.length > 0 && (
              <div className="cat-opinion-fotos">
                {r.fotos.map((f) => (
                  <a key={f} href={urlFoto(f)} target="_blank" rel="noreferrer">
                    <img src={urlFoto(f)} alt="" />
                  </a>
                ))}
              </div>
            )}
            <div className="apartado-acciones">
              {r.estado !== 'publicada' && (
                <BotonAccion className="btn btn-primario" onClick={() => cambiar(r, 'publicada')}>
                  Publicar
                </BotonAccion>
              )}
              {r.estado !== 'oculta' && (
                <BotonAccion className="btn" onClick={() => cambiar(r, 'oculta')}>
                  Ocultar
                </BotonAccion>
              )}
              <BotonAccion className="btn btn-peligro-suave" onClick={() => borrar(r)}>
                Borrar
              </BotonAccion>
            </div>
          </article>
        ))}
      </div>

      <NuevaOpinion
        abierta={nueva}
        onCerrar={() => setNueva(false)}
        alGuardar={async () => {
          setNueva(false)
          setEstado('publicada')
          await carga.recargar()
        }}
      />
    </div>
  )
}

/** Opinión que un cliente real dio por otro medio (WhatsApp, Instagram). No sale como compra verificada. */
function NuevaOpinion({ abierta, onCerrar, alGuardar }: { abierta: boolean; onCerrar: () => void; alGuardar: () => Promise<void> }) {
  const avisar = useAvisar()
  const [nombre, setNombre] = useState('')
  const [estrellas, setEstrellas] = useState(5)
  const [texto, setTexto] = useState('')
  const [producto, setProducto] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const productos = useCarga(
    async () =>
      datos(await supabase.from('productos').select('id, nombre').eq('activo', true).order('nombre')) as {
        id: string
        nombre: string
      }[],
  )

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return
    setSubiendo(true)
    try {
      const nuevas: string[] = []
      for (const a of [...archivos].slice(0, 3 - fotos.length)) nuevas.push(await subirFoto('resenas/equipo', a))
      setFotos((f) => [...f, ...nuevas].slice(0, 3))
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setSubiendo(false)
    }
  }

  const guardar = async () => {
    if (!nombre.trim()) return avisar('Escribe el nombre del cliente', 'error')
    try {
      datos(
        await supabase.from('resenas').insert({
          nombre: nombre.trim(),
          estrellas,
          texto: texto.trim() || null,
          producto_id: producto || null,
          fotos,
          estado: 'publicada',
        }),
      )
      setNombre('')
      setTexto('')
      setProducto('')
      setFotos([])
      setEstrellas(5)
      avisar('Opinión publicada')
      await alGuardar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <Hoja titulo="Agregar opinión" abierta={abierta} onCerrar={onCerrar}>
      <p className="sutil">
        Solo opiniones reales que un cliente te dio por WhatsApp o Instagram. Estas no salen como "Compra verificada".
      </p>
      <label className="campo">
        <span>Nombre del cliente</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Laura Martínez" />
      </label>
      <div className="campo">
        <span>Estrellas</span>
        <div className="chips">
          {[5, 4, 3, 2, 1].map((n) => (
            <button key={n} className={`chip ${estrellas === n ? 'chip-activo' : ''}`} onClick={() => setEstrellas(n)}>
              {n} ★
            </button>
          ))}
        </div>
      </div>
      <label className="campo">
        <span>Lo que dijo</span>
        <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </label>
      <label className="campo">
        <span>Prenda (opcional)</span>
        <select value={producto} onChange={(e) => setProducto(e.target.value)}>
          <option value="">De la tienda en general</option>
          {productos.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <div className="campo">
        <span>Fotos (opcional, hasta 3)</span>
        <div className="cat-opinar-fotos">
          {fotos.map((f) => (
            <div key={f} className="cat-opinar-foto">
              <img src={urlFoto(f)} alt="" />
              <button type="button" aria-label="Quitar foto" onClick={() => setFotos(fotos.filter((x) => x !== f))}>
                <Icono nombre="cerrar" tam={14} />
              </button>
            </div>
          ))}
          {fotos.length < 3 && (
            <label className="cat-opinar-agregar">
              <Icono nombre="camara" tam={24} />
              <span>{subiendo ? 'Subiendo…' : 'Agregar'}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={subiendo}
                onChange={(e) => {
                  void subir(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      </div>
      <BotonAccion className="btn btn-primario btn-bloque" onClick={guardar}>
        Publicar opinión
      </BotonAccion>
    </Hoja>
  )
}

/** Opiniones esperando aprobación (0 si aún no existe la tabla). */
export async function contarOpinionesPendientes(): Promise<number> {
  const r = await supabase.from('resenas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
  return r.error ? 0 : (r.count ?? 0)
}
