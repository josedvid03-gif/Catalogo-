import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, urlFoto } from '../../lib/supabase'
import { subirFoto } from '../../lib/imagenes'
import { Cargando } from '../../components/Comunes'
import { Icono } from '../../components/Icono'
import { useCatalogo, type Opinion } from './datos'

/* ------------------------------------------------------------------ */
/*  Piezas                                                             */
/* ------------------------------------------------------------------ */

export function Estrellas({ valor, tam = 18 }: { valor: number; tam?: number }) {
  return (
    <span className="cat-estrellas" style={{ fontSize: tam }} role="img" aria-label={`${valor.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={valor >= i - 0.25 ? 'llena' : ''} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

function promedio(ops: Opinion[]): number {
  return ops.length ? ops.reduce((s, o) => s + o.estrellas, 0) / ops.length : 0
}

function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias < 1) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const anios = Math.floor(meses / 12)
  return `hace ${anios} ${anios === 1 ? 'año' : 'años'}`
}

const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

function TarjetaOpinion({ o, prenda }: { o: Opinion; prenda?: { id: string; nombre: string } }) {
  return (
    <article className="cat-opinion">
      <div className="cat-opinion-cabeza">
        <span className="cat-opinion-avatar">
          {iniciales(o.nombre)}
          {o.verificada && (
            <span className="cat-opinion-check" aria-hidden="true">
              <Icono nombre="check" tam={11} />
            </span>
          )}
        </span>
        <span className="cat-opinion-quien">
          <strong>{o.nombre}</strong>
          {o.verificada && <span className="sutil">Compra verificada</span>}
        </span>
      </div>
      <span className="sutil cat-opinion-fecha">{haceCuanto(o.fecha)}</span>
      <Estrellas valor={o.estrellas} />
      {o.texto && <p>{o.texto}</p>}
      {prenda && (
        <Link to={`/catalogo/p/${prenda.id}`} className="cat-opinion-prenda">
          {prenda.nombre}
        </Link>
      )}
      {o.fotos.length > 0 && (
        <div className="cat-opinion-fotos">
          {o.fotos.map((f) => (
            <a key={f} href={urlFoto(f)} target="_blank" rel="noreferrer">
              <img src={urlFoto(f)} alt={`Foto de ${o.nombre}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </article>
  )
}

/** Puntaje pequeño para las tarjetas del catálogo: ★ 4.8 (12). */
export function PuntajePrenda({ productoId }: { productoId: string }) {
  const { opiniones } = useCatalogo()
  const suyas = opiniones.filter((o) => o.producto_id === productoId)
  if (!suyas.length) return null
  return (
    <span className="cat-puntaje">
      <span aria-hidden="true">★</span> {promedio(suyas).toFixed(1)} <span className="sutil">({suyas.length})</span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Secciones                                                          */
/* ------------------------------------------------------------------ */

/** En la página de una prenda: sus opiniones (o, si no tiene, las de la tienda). */
export function OpinionesPrenda({ productoId }: { productoId: string }) {
  const { opiniones } = useCatalogo()
  const [todas, setTodas] = useState(false)
  const suyas = opiniones.filter((o) => o.producto_id === productoId)
  const lista = suyas.length ? suyas : opiniones
  if (!lista.length) return null
  const visibles = todas ? lista : lista.slice(0, 3)
  return (
    <section className="cat-opiniones" aria-label="Opiniones">
      <div className="cat-opiniones-resumen">
        <h2>{suyas.length ? 'Opiniones' : 'Lo que dicen nuestros clientes'}</h2>
        <span>
          <Estrellas valor={promedio(lista)} tam={20} /> <strong>{promedio(lista).toFixed(1)}</strong>{' '}
          <span className="sutil">
            · {lista.length} opinión{lista.length === 1 ? '' : 'es'}
          </span>
        </span>
      </div>
      {visibles.map((o) => (
        <TarjetaOpinion key={o.id} o={o} />
      ))}
      {lista.length > visibles.length && (
        <button className="cat-btn cat-btn-contorno-oscuro cat-btn-bloque" onClick={() => setTodas(true)}>
          Ver las {lista.length} opiniones
        </button>
      )}
    </section>
  )
}

/** En la página principal: las opiniones más recientes, deslizables. */
export function OpinionesInicio() {
  const { opiniones, prendas } = useCatalogo()
  const conTexto = opiniones.filter((o) => o.texto || o.fotos.length).slice(0, 12)
  if (!conTexto.length) return null
  return (
    <section className="cat-opiniones cat-opiniones-inicio" aria-label="Opiniones de clientes">
      <div className="cat-opiniones-resumen">
        <h2>Lo que dicen nuestros clientes</h2>
        <span>
          <Estrellas valor={promedio(opiniones)} tam={20} /> <strong>{promedio(opiniones).toFixed(1)}</strong>{' '}
          <span className="sutil">· {opiniones.length} opiniones</span>
        </span>
      </div>
      <div className="cat-opiniones-carrusel">
        {conTexto.map((o) => (
          <TarjetaOpinion key={o.id} o={o} prenda={prendas.find((p) => p.id === o.producto_id)} />
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Página para que el cliente deje su opinión (/catalogo/opinar/…)    */
/* ------------------------------------------------------------------ */

interface Invitacion {
  nombre: string | null
  tienda: string
  prendas: { id: string; nombre: string; foto: string | null }[]
}

export function OpinarPagina() {
  const { token = '' } = useParams()
  const [inv, setInv] = useState<Invitacion | null | undefined>(undefined)
  const [nombre, setNombre] = useState('')
  const [estrellas, setEstrellas] = useState(0)
  const [texto, setTexto] = useState('')
  const [prenda, setPrenda] = useState<string | null>(null)
  const [fotos, setFotos] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    supabase.rpc('ver_invitacion', { p_token: token }).then(({ data, error }) => {
      const i = error ? null : (data as Invitacion | null)
      setInv(i)
      if (i) {
        setNombre(i.nombre ?? '')
        if (i.prendas.length === 1) setPrenda(i.prendas[0].id)
      }
    })
  }, [token])

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return
    setSubiendo(true)
    setError(null)
    try {
      const nuevas: string[] = []
      for (const a of [...archivos].slice(0, 3 - fotos.length)) nuevas.push(await subirFoto(`resenas/${token}`, a))
      setFotos((f) => [...f, ...nuevas].slice(0, 3))
    } catch {
      setError('No se pudo subir la foto. Intenta con otra.')
    } finally {
      setSubiendo(false)
    }
  }

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    const { error } = await supabase.rpc('enviar_resena', {
      p: { token, nombre, estrellas: String(estrellas), texto, producto_id: prenda, fotos },
    })
    setEnviando(false)
    if (error) setError(error.message.includes('enlace') ? error.message : 'No se pudo enviar. Intenta de nuevo.')
    else setListo(true)
  }

  if (inv === undefined) return <Cargando />

  return (
    <main className="cat-cuerpo cat-opinar">
      {!inv ? (
        <div className="vacio">
          <Icono nombre="alerta" tam={32} />
          <div>
            Este enlace ya se usó o venció. <Link to="/catalogo">Ver el catálogo</Link>
          </div>
        </div>
      ) : listo ? (
        <div className="cat-opinar-listo">
          <Icono nombre="check" tam={40} />
          <h1>¡Gracias{nombre ? `, ${nombre.split(' ')[0]}` : ''}! 🙌</h1>
          <p>Tu opinión nos ayuda muchísimo. Aparecerá en el catálogo en cuanto la revisemos.</p>
          <Link to="/catalogo" className="cat-btn cat-btn-oscuro cat-btn-bloque">
            Ver el catálogo
          </Link>
        </div>
      ) : (
        <>
          <h1 className="cat-opinar-titulo">¿Qué tal tu compra{inv.nombre ? `, ${inv.nombre.split(' ')[0]}` : ''}?</h1>
          <p className="sutil">Cuéntanos cómo te fue con {inv.tienda}. Toma menos de un minuto.</p>

          {inv.prendas.length > 1 && (
            <div className="campo">
              <span>¿De cuál prenda?</span>
              <div className="cat-opinar-prendas">
                {inv.prendas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`cat-opinar-prenda ${prenda === p.id ? 'activo' : ''}`}
                    onClick={() => setPrenda(prenda === p.id ? null : p.id)}
                    aria-pressed={prenda === p.id}
                  >
                    {p.foto ? <img src={urlFoto(p.foto)} alt="" /> : <Icono nombre="prendas" />}
                    <span>{p.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="campo">
            <span>Tu calificación *</span>
            <div className="cat-opinar-estrellas" role="radiogroup" aria-label="Estrellas">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={estrellas === i}
                  aria-label={`${i} estrella${i === 1 ? '' : 's'}`}
                  className={estrellas >= i ? 'llena' : ''}
                  onClick={() => setEstrellas(i)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <label className="campo">
            <span>Tu comentario</span>
            <textarea
              rows={4}
              maxLength={1000}
              value={texto}
              placeholder="¿Qué te pareció la calidad, la talla, la atención…?"
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>

          <div className="campo">
            <span>Fotos con tu prenda (opcional, hasta 3)</span>
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

          <label className="campo">
            <span>Tu nombre *</span>
            <input value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
            <small className="sutil">
              Se publica corto, por ejemplo: <strong>{corto(nombre) || 'Laura M.'}</strong>
            </small>
          </label>

          {error && <p className="texto-error">{error}</p>}
          <button
            className="cat-btn cat-btn-oscuro cat-btn-bloque"
            disabled={!estrellas || !nombre.trim() || enviando || subiendo}
            onClick={enviar}
          >
            {enviando ? 'Enviando…' : !estrellas ? 'Elige las estrellas' : !nombre.trim() ? 'Escribe tu nombre' : 'Enviar mi opinión'}
          </button>
        </>
      )}
    </main>
  )
}

/** "Alberto Ramírez" → "Alberto R." (igual que lo publica el catálogo). */
function corto(nombre: string): string {
  const [a, b] = nombre.trim().split(/\s+/)
  return a ? `${a}${b ? ` ${b[0].toUpperCase()}.` : ''}` : ''
}
