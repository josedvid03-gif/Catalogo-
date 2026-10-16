import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { urlFoto } from '../../lib/supabase'
import { cop, enlaceWhatsapp, ordenTalla, varianteTexto } from '../../lib/format'
import { useAvisar } from '../../lib/aviso'
import { Cargando } from '../../components/Comunes'
import { Icono } from '../../components/Icono'
import { TarjetaPrenda } from './Catalogo'
import { descuento, esNueva, urlPrendaPublica, useCatalogo, type PrendaCatalogo } from './datos'

/** Descarga la foto principal para poder compartirla como imagen (WhatsApp, Instagram). */
function useArchivoFoto(p: PrendaCatalogo | undefined) {
  const [archivo, setArchivo] = useState<File | null>(null)
  useEffect(() => {
    setArchivo(null)
    if (!p?.fotos[0]) return
    let vivo = true
    fetch(urlFoto(p.fotos[0]))
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (vivo) setArchivo(new File([b], `${p.nombre.replace(/[^\w]+/g, '-').toLowerCase()}.jpg`, { type: b.type || 'image/jpeg' }))
      })
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [p])
  return archivo
}

export function PrendaPublica() {
  const { id } = useParams()
  const avisar = useAvisar()
  const { prendas, tienda, cargando, agregar, setPedidoAbierto, pedido } = useCatalogo()
  const p = prendas.find((x) => x.id === id)
  const [varianteId, setVarianteId] = useState<string | null>(null)
  const [foto, setFoto] = useState(0)
  const galeria = useRef<HTMLDivElement>(null)
  const archivo = useArchivoFoto(p)

  const variantes = useMemo(
    () =>
      [...(p?.variantes ?? [])].sort(
        (a, b) => a.color.localeCompare(b.color) || ordenTalla(a.talla) - ordenTalla(b.talla),
      ),
    [p],
  )

  useEffect(() => {
    window.scrollTo(0, 0)
    setFoto(0)
    setVarianteId(null)
  }, [id])
  useEffect(() => {
    if (variantes.length === 1) setVarianteId(variantes[0].id)
  }, [variantes])
  useEffect(() => {
    if (p && tienda) document.title = `${p.nombre} · ${tienda.nombre}`
  }, [p, tienda])

  const relacionadas = useMemo(() => {
    if (!p) return []
    return prendas
      .filter((x) => x.id !== p.id && (x.categoria === p.categoria || (p.marca && x.marca === p.marca)))
      .slice(0, 4)
  }, [p, prendas])

  if (!p) {
    if (cargando) return <Cargando />
    return (
      <main className="cat-cuerpo">
        <div className="vacio">
          <Icono nombre="prendas" tam={32} />
          <div>
            Esta prenda ya no está disponible. <Link to="/catalogo">Ver el catálogo</Link>
          </div>
        </div>
      </main>
    )
  }

  const d = descuento(p)
  const elegida = variantes.find((v) => v.id === varianteId)
  const enPedido = pedido.find((l) => l.varianteId === varianteId)
  const textoCompartir = `${p.nombre}${p.marca && !p.nombre.toLowerCase().includes(p.marca.toLowerCase()) ? ` (${p.marca})` : ''} — ${cop(p.precio)}${
    d ? ` (antes ${cop(p.precio_antes!)})` : ''
  }`

  const compartir = async () => {
    const url = urlPrendaPublica(p.id)
    try {
      if (archivo && navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: p.nombre, text: `${textoCompartir}\n${url}` })
        return
      }
      if (navigator.share) {
        await navigator.share({ title: p.nombre, text: textoCompartir, url })
        return
      }
      await navigator.clipboard.writeText(`${textoCompartir}\n${url}`)
      avisar('Enlace copiado')
    } catch {
      /* el usuario canceló */
    }
  }

  const irAFoto = (i: number) => {
    setFoto(i)
    const g = galeria.current
    if (g) g.scrollTo({ left: g.clientWidth * i, behavior: 'smooth' })
  }

  return (
    <main className="cat-cuerpo cat-detalle">
      <Link to="/catalogo" className="cat-volver">
        <Icono nombre="atras" tam={18} /> Catálogo
      </Link>

      <div className="cat-detalle-grid">
        <div className="cat-galeria-marco">
          {p.fotos.length > 0 ? (
            <>
              <div
                className="cat-galeria"
                ref={galeria}
                onScroll={(e) => {
                  const g = e.currentTarget
                  setFoto(Math.round(g.scrollLeft / g.clientWidth))
                }}
              >
                {p.fotos.map((f, i) => (
                  <img key={f} src={urlFoto(f)} alt={`${p.nombre} foto ${i + 1}`} loading={i ? 'lazy' : 'eager'} />
                ))}
              </div>
              {p.fotos.length > 1 && (
                <div className="cat-puntos">
                  {p.fotos.map((f, i) => (
                    <button
                      key={f}
                      className={i === foto ? 'activo' : ''}
                      onClick={() => irAFoto(i)}
                      aria-label={`Foto ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="cat-sin-foto cat-sin-foto-grande">
              <img src="/logo.png" alt="" width="120" height="120" />
            </div>
          )}
          <div className="cat-insignias">
            {d > 0 && <span className="cat-insignia cat-insignia-rebaja">-{d}%</span>}
            {esNueva(p) && <span className="cat-insignia">Nuevo</span>}
          </div>
        </div>

        <div className="cat-detalle-info">
          {p.marca && <span className="cat-marca">{p.marca}</span>}
          <h1 className="cat-detalle-nombre">{p.nombre}</h1>
          <p className="cat-precio cat-precio-grande">
            <span className={d ? 'cat-precio-rebaja' : ''}>{cop(p.precio)}</span>
            {d > 0 && (
              <>
                <s>{cop(p.precio_antes!)}</s>
                <span className="cat-ahorro">Ahorras {cop(p.precio_antes! - p.precio)}</span>
              </>
            )}
          </p>

          {variantes.length > 0 && (
            <div className="cat-elegir">
              <span className="cat-etiqueta">
                {variantes.length === 1 ? 'Talla' : 'Elige tu talla'}
                {elegida && elegida.disponible === 1 && <em> · ¡Última unidad!</em>}
              </span>
              <div className="cat-tallas">
                {variantes.map((v) => (
                  <button
                    key={v.id}
                    className={`cat-talla ${varianteId === v.id ? 'activo' : ''}`}
                    onClick={() => setVarianteId(v.id)}
                    aria-pressed={varianteId === v.id}
                  >
                    {varianteTexto(v.talla, v.color) || 'Única'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            className="cat-btn cat-btn-oscuro cat-btn-bloque"
            disabled={!elegida}
            onClick={() => {
              if (!elegida) return
              agregar(p, elegida)
              avisar('Agregado a tu pedido')
            }}
          >
            <Icono nombre="bolsa" />
            {elegida ? (enPedido ? 'Agregar otra' : 'Agregar al pedido') : 'Elige una talla'}
          </button>
          {enPedido && (
            <button className="enlace centrado" onClick={() => setPedidoAbierto(true)}>
              Ver mi pedido →
            </button>
          )}

          <div className="cat-acciones-sec">
            {tienda?.whatsapp && (
              <a
                className="cat-btn cat-btn-contorno-oscuro"
                href={enlaceWhatsapp(
                  tienda.whatsapp,
                  `Hola 👋 Me interesa: ${p.nombre}${elegida ? ` — Talla ${varianteTexto(elegida.talla, elegida.color)}` : ''} — ${cop(p.precio)}\n${urlPrendaPublica(p.id)}`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <Icono nombre="chat" tam={18} /> Preguntar
              </a>
            )}
            <button className="cat-btn cat-btn-contorno-oscuro" onClick={compartir}>
              <Icono nombre="compartir" tam={18} /> Compartir
            </button>
          </div>

          {tienda?.whatsapp && (
            <div className="cat-preguntas">
              <span className="cat-etiqueta">Pregúntanos por WhatsApp</span>
              <div className="cat-preguntas-lista">
                {[
                  '¿Está disponible?',
                  '¿Tienen otra talla o color?',
                  '¿Cuánto cuesta el envío a mi ciudad?',
                  '¿Me envías más fotos o un video?',
                  '¿Me la pueden apartar?',
                ].map((pregunta) => (
                  <a
                    key={pregunta}
                    className="cat-pregunta"
                    href={enlaceWhatsapp(
                      tienda.whatsapp!,
                      `Hola 👋 ${pregunta}\n${p.nombre}${elegida ? ` — Talla ${varianteTexto(elegida.talla, elegida.color)}` : ''} — ${cop(p.precio)}\n${urlPrendaPublica(p.id)}`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {pregunta}
                  </a>
                ))}
              </div>
            </div>
          )}

          {p.descripcion && <p className="cat-descripcion">{p.descripcion}</p>}

          <ul className="cat-datos">
            {p.categoria && (
              <li>
                <span>Categoría</span>
                <strong>{p.categoria}</strong>
              </li>
            )}
            {p.marca && (
              <li>
                <span>Marca</span>
                <strong>{p.marca}</strong>
              </li>
            )}
          </ul>
          {tienda?.info && <p className="cat-info-tienda">{tienda.info}</p>}
        </div>
      </div>

      {relacionadas.length > 0 && (
        <section className="cat-relacionadas">
          <h2>También te puede gustar</h2>
          <div className="cat-rejilla">
            {relacionadas.map((x) => (
              <TarjetaPrenda key={x.id} prenda={x} />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
