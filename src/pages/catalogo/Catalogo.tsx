import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useMatch } from 'react-router-dom'
import { urlFoto } from '../../lib/supabase'
import { cop, enlaceWhatsapp, ocultarNombre, ordenTalla } from '../../lib/format'
import { CajaError, Cantidad, Cargando, Hoja } from '../../components/Comunes'
import { Icono } from '../../components/Icono'
import { useAvisar } from '../../lib/aviso'
import {
  ProveedorCatalogo,
  descuento,
  esNueva,
  urlPrendaPublica,
  useCatalogo,
  type PrendaCatalogo,
} from './datos'
import { GuiaTallas, InfoCompra, tablasPara } from './Ayudas'

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/* ------------------------------------------------------------------ */
/*  Marco común: barra, pedido y pie                                   */
/* ------------------------------------------------------------------ */

export function MarcoCatalogo() {
  return (
    <ProveedorCatalogo>
      <MarcoInterno />
    </ProveedorCatalogo>
  )
}

function MarcoInterno() {
  const { tienda, pedido, setPedidoAbierto, prendas, registrar } = useCatalogo()
  const enPrenda = useMatch('/catalogo/p/:id')
  const prendaActual = enPrenda ? prendas.find((p) => p.id === enPrenda.params.id) : undefined
  const mensajeFlotante = prendaActual
    ? `Hola ${tienda?.nombre ?? ''} 👋 Tengo una pregunta sobre: ${prendaActual.nombre} — ${cop(prendaActual.precio)}\n${urlPrendaPublica(prendaActual.id)}`
    : `Hola ${tienda?.nombre ?? ''} 👋 Vi su catálogo y tengo una pregunta.`
  const unidades = pedido.reduce((s, l) => s + l.cantidad, 0)
  const total = pedido.reduce((s, l) => s + l.cantidad * l.precio, 0)

  useEffect(() => {
    document.title = tienda?.nombre ? `${tienda.nombre} · Catálogo` : 'Catálogo'
    document.body.classList.add('modo-catalogo')
    return () => document.body.classList.remove('modo-catalogo')
  }, [tienda?.nombre])

  return (
    <div className="cat">
      <header className="cat-barra">
        <Link to="/catalogo" className="cat-barra-marca">
          <img src="/logo-128.png" alt="" width="36" height="36" />
          <span>{tienda?.nombre ?? ''}</span>
        </Link>
        <button className="cat-bolsa" onClick={() => setPedidoAbierto(true)} aria-label={`Ver pedido (${unidades})`}>
          <Icono nombre="bolsa" tam={22} />
          {unidades > 0 && <span className="cat-bolsa-num">{unidades}</span>}
        </button>
      </header>

      <Outlet />

      <PieCatalogo />

      {unidades > 0 && (
        <button className="cat-pedido-flotante" onClick={() => setPedidoAbierto(true)}>
          <Icono nombre="bolsa" />
          Ver pedido ({unidades}) · {cop(total)}
        </button>
      )}
      {tienda?.whatsapp && (
        <a
          className={`cat-wa-flotante ${unidades > 0 ? 'elevado' : ''}`}
          href={enlaceWhatsapp(tienda.whatsapp, mensajeFlotante)}
          onClick={() =>
            registrar({
              tipo: prendaActual ? 'pregunta' : 'general',
              mensaje: mensajeFlotante,
              producto_id: prendaActual?.id,
              producto_nombre: prendaActual?.nombre,
            })
          }
          target="_blank"
          rel="noreferrer"
          aria-label="Escríbenos por WhatsApp"
        >
          <Icono nombre="chat" tam={26} />
          <span className="cat-wa-texto">¿Preguntas?</span>
        </a>
      )}
      <Pedido />
    </div>
  )
}

function PieCatalogo() {
  const { tienda, registrar } = useCatalogo()
  if (!tienda) return null
  return (
    <footer className="cat-pie">
      <img src="/logo-128.png" alt="" width="64" height="64" />
      <strong className="cat-pie-nombre">{tienda.nombre}</strong>
      {tienda.eslogan && <span className="cat-pie-eslogan">{tienda.eslogan}</span>}
      {tienda.info && <p className="cat-pie-info">{tienda.info}</p>}
      {tienda.pago?.nequi && <p className="cat-pie-info">Pagos por Nequi: {tienda.pago.nequi}</p>}
      <div className="cat-redes">
        {tienda.whatsapp && (
          <a
            href={enlaceWhatsapp(tienda.whatsapp, `Hola ${tienda.nombre} 👋`)}
            onClick={() => registrar({ tipo: 'general', mensaje: `Hola ${tienda.nombre} 👋` })}
            target="_blank"
            rel="noreferrer"
            className="cat-btn cat-btn-claro"
          >
            <Icono nombre="chat" tam={18} /> WhatsApp
          </a>
        )}
        {tienda.instagram && (
          <a
            href={`https://instagram.com/${tienda.instagram}`}
            target="_blank"
            rel="noreferrer"
            className="cat-btn cat-btn-claro"
          >
            <Icono nombre="instagram" tam={18} /> @{tienda.instagram}
          </a>
        )}
      </div>
      <span className="cat-pie-copy">
        © {new Date().getFullYear()} {tienda.nombre}
      </span>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/*  Pedido (bolsa)                                                     */
/* ------------------------------------------------------------------ */

interface DatosEnvio {
  entrega: 'envio' | 'recoger'
  nombre: string
  celular: string
  cedula: string
  ciudad: string
  direccion: string
  barrio: string
}

const CLAVE_DATOS = 'datos-envio-catalogo-v1'
const datosVacios: DatosEnvio = { entrega: 'envio', nombre: '', celular: '', cedula: '', ciudad: '', direccion: '', barrio: '' }

function leerDatos(): DatosEnvio {
  try {
    const t = localStorage.getItem(CLAVE_DATOS)
    return t ? { ...datosVacios, ...(JSON.parse(t) as Partial<DatosEnvio>) } : datosVacios
  } catch {
    return datosVacios
  }
}

function Pedido() {
  const avisar = useAvisar()
  const { tienda, pedido, cambiarCantidad, quitar, vaciar, maximo, pedidoAbierto, setPedidoAbierto, asesor, registrar } =
    useCatalogo()
  const [d, setD] = useState<DatosEnvio>(leerDatos)
  const [verQr, setVerQr] = useState(false)
  const [intento, setIntento] = useState(false)
  const total = pedido.reduce((s, l) => s + l.cantidad * l.precio, 0)
  const unidades = pedido.reduce((s, l) => s + l.cantidad, 0)
  const pago = tienda?.pago
  const envio = d.entrega === 'envio'

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_DATOS, JSON.stringify(d))
    } catch {
      /* navegador sin almacenamiento */
    }
  }, [d])

  const faltan = [
    !d.nombre.trim() && 'nombre',
    d.celular.replace(/\D/g, '').length < 7 && 'celular',
    envio && !d.ciudad.trim() && 'ciudad',
    envio && !d.direccion.trim() && 'dirección',
  ].filter(Boolean) as string[]

  const mensaje = () =>
    [
      `Hola ${tienda?.nombre ?? ''} 👋 Quiero hacer este pedido:`,
      '',
      ...pedido.map(
        (l) =>
          `• ${l.cantidad > 1 ? `${l.cantidad} x ` : ''}${l.nombre}${l.talla ? ` — Talla ${l.talla}` : ''}${
            l.color ? ` — ${l.color}` : ''
          } — ${cop(l.precio * l.cantidad)}\n  ${urlPrendaPublica(l.productoId)}`,
      ),
      '',
      `*Total: ${cop(total)}* (${unidades} prenda${unidades === 1 ? '' : 's'})${envio ? ' + envío' : ''}`,
      '',
      envio ? '📦 *Datos de envío*' : '🛍️ *Recojo en persona*',
      `Nombre: ${d.nombre.trim()}`,
      `Celular: ${d.celular.trim()}`,
      ...(d.cedula.trim() ? [`Cédula: ${d.cedula.trim()}`] : []),
      ...(envio
        ? [
            `Ciudad: ${d.ciudad.trim()}`,
            `Dirección: ${d.direccion.trim()}`,
            ...(d.barrio.trim() ? [`Barrio / indicaciones: ${d.barrio.trim()}`] : []),
          ]
        : []),
      '',
      pago?.nequi
        ? `💳 Pago por Nequi. Apenas me confirmes disponibilidad${envio ? ' y el valor del envío' : ''}, pago y te envío el comprobante.`
        : `Quedo atento${envio ? ' al valor del envío y' : ''} a la forma de pago.`,
    ].join('\n')

  const enviar = () => {
    setIntento(true)
    if (faltan.length) {
      avisar(`Falta: ${faltan.join(', ')}`, 'error')
      return
    }
    if (!tienda?.whatsapp) return
    const texto = mensaje()
    registrar({
      tipo: 'pedido',
      mensaje: texto,
      total,
      cliente_nombre: d.nombre.trim(),
      cliente_celular: d.celular.trim(),
      cliente_cedula: d.cedula.trim() || undefined,
      cliente_ciudad: envio ? d.ciudad.trim() : undefined,
      cliente_direccion: envio ? [d.direccion.trim(), d.barrio.trim()].filter(Boolean).join(' · ') : undefined,
      entrega: d.entrega,
    })
    window.open(enlaceWhatsapp(tienda.whatsapp, texto), '_blank', 'noopener')
  }

  const copiar = async (texto: string, que: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      avisar(`${que} copiado`)
    } catch {
      avisar(texto)
    }
  }

  const campo = (k: keyof Omit<DatosEnvio, 'entrega'>, etiqueta: string, extra: Record<string, string> = {}, requerido = false) => (
    <label className={`campo ${intento && requerido && faltan.length && !String(d[k]).trim() ? 'campo-error' : ''}`}>
      <span>
        {etiqueta}
        {requerido ? ' *' : ''}
      </span>
      <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} {...extra} />
    </label>
  )

  return (
    <Hoja titulo="Tu pedido" abierta={pedidoAbierto} onCerrar={() => setPedidoAbierto(false)}>
      {pedido.length === 0 ? (
        <div className="vacio">
          <Icono nombre="bolsa" tam={32} />
          <div>Tu pedido está vacío. Toca una prenda y elige tu talla.</div>
        </div>
      ) : (
        <>
          <ul className="lineas">
            {pedido.map((l) => (
              <li key={l.varianteId} className="linea">
                {l.foto ? (
                  <img className="foto foto-sm" src={urlFoto(l.foto)} alt="" />
                ) : (
                  <span className="foto foto-sm foto-vacia" />
                )}
                <div className="linea-info">
                  <strong>{l.nombre}</strong>
                  <span className="sutil">{[l.talla && `Talla ${l.talla}`, l.color].filter(Boolean).join(' · ')}</span>
                  <div className="linea-controles">
                    <Cantidad
                      valor={l.cantidad}
                      max={maximo(l.varianteId)}
                      onChange={(n) => cambiarCantidad(l.varianteId, n)}
                    />
                    <strong className="linea-precio">{cop(l.precio * l.cantidad)}</strong>
                  </div>
                </div>
                <button className="btn-icono" aria-label={`Quitar ${l.nombre}`} onClick={() => quitar(l.varianteId)}>
                  <Icono nombre="basura" />
                </button>
              </li>
            ))}
          </ul>
          <div className="fila-total fuerte">
            <span>Total</span>
            <span>{cop(total)}</span>
          </div>
          {envio && <p className="sutil">+ valor del envío, que te confirmamos por WhatsApp.</p>}

          <section className="cat-form">
            <span className="cat-etiqueta">¿Cómo lo recibes?</span>
            <div className="cat-tallas">
              <button
                type="button"
                className={`cat-talla ${envio ? 'activo' : ''}`}
                onClick={() => setD({ ...d, entrega: 'envio' })}
              >
                Envío a domicilio
              </button>
              <button
                type="button"
                className={`cat-talla ${!envio ? 'activo' : ''}`}
                onClick={() => setD({ ...d, entrega: 'recoger' })}
              >
                Recoger en persona
              </button>
            </div>

            <span className="cat-etiqueta">Tus datos</span>
            {campo('nombre', 'Nombre completo', { autoComplete: 'name' }, true)}
            <div className="dos-columnas">
              {campo('celular', 'Celular', { type: 'tel', inputMode: 'tel', autoComplete: 'tel', placeholder: '300 123 4567' }, true)}
              {campo('cedula', 'Cédula', { inputMode: 'numeric', placeholder: 'Para la guía' })}
            </div>
            {envio && (
              <>
                {campo('ciudad', 'Ciudad', { autoComplete: 'address-level2', placeholder: 'Ej: Bogotá' }, true)}
                {campo('direccion', 'Dirección', { autoComplete: 'street-address', placeholder: 'Ej: Calle 45 # 12-34 apto 301' }, true)}
                {campo('barrio', 'Barrio / indicaciones', { placeholder: 'Ej: Chapinero, portería, torre 2' })}
              </>
            )}
          </section>

          {(pago?.nequi || pago?.otros) && (
            <section className="cat-pago">
              <span className="cat-etiqueta">Cómo pagar</span>
              <ol className="cat-pasos">
                <li>Envía tu pedido por WhatsApp.</li>
                <li>Te confirmamos disponibilidad{envio ? ' y el valor del envío' : ''}.</li>
                <li>Pagas y nos envías el comprobante.</li>
              </ol>
              {pago.nequi && (
                <div className="cat-nequi">
                  <div className="cat-nequi-datos">
                    <span className="cat-nequi-marca">Nequi</span>
                    <strong className="cat-nequi-numero">{pago.nequi}</strong>
                    {pago.titular && <span className="sutil">A nombre de {ocultarNombre(pago.titular)}</span>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => copiar(pago.nequi!.replace(/\D/g, ''), 'Número')}
                  >
                    <Icono nombre="copiar" tam={16} /> Copiar
                  </button>
                </div>
              )}
              {pago.qr && (
                <>
                  <button type="button" className="enlace" onClick={() => setVerQr(!verQr)}>
                    {verQr ? 'Ocultar código QR' : 'Ver código QR de Nequi'}
                  </button>
                  {verQr && <img className="cat-qr" src={urlFoto(pago.qr)} alt="Código QR de Nequi" />}
                </>
              )}
              {pago.otros && <p className="sutil cat-pago-otros">{pago.otros}</p>}
            </section>
          )}

          {asesor && <p className="cat-asesor">Te atiende: <strong>{asesor.nombre}</strong></p>}
          {tienda?.whatsapp ? (
            <button type="button" className="cat-btn cat-btn-oscuro cat-btn-bloque" onClick={enviar}>
              <Icono nombre="chat" /> Enviar pedido por WhatsApp
            </button>
          ) : (
            <p className="sutil">La tienda aún no tiene WhatsApp configurado.</p>
          )}
          <p className="sutil centrado">Tus datos solo se envían a la tienda por WhatsApp.</p>
          <button className="enlace centrado" onClick={vaciar}>
            Vaciar pedido
          </button>
        </>
      )}
    </Hoja>
  )
}

/* ------------------------------------------------------------------ */
/*  Lista de prendas                                                   */
/* ------------------------------------------------------------------ */

type Orden = 'recientes' | 'menor' | 'mayor' | 'rebajas'

export function Catalogo() {
  const { tienda, prendas, cargando, error, recargar, registrar } = useCatalogo()
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const [marca, setMarca] = useState('')
  const [talla, setTalla] = useState('')
  const [orden, setOrden] = useState<Orden>('recientes')
  const [verGuia, setVerGuia] = useState(false)
  // /catalogo?rebajas abre directo en las rebajas (para compartir el enlace).
  const [soloRebajas, setSoloRebajas] = useState(() => new URLSearchParams(location.search).has('rebajas'))

  const categorias = useMemo(
    () => [...new Set(prendas.map((p) => p.categoria).filter(Boolean) as string[])].sort(),
    [prendas],
  )
  const marcas = useMemo(() => [...new Set(prendas.map((p) => p.marca).filter(Boolean) as string[])].sort(), [prendas])
  const tallas = useMemo(
    () =>
      [...new Set(prendas.flatMap((p) => p.variantes.map((v) => v.talla)).filter(Boolean))].sort(
        (a, b) => ordenTalla(a) - ordenTalla(b),
      ),
    [prendas],
  )
  const hayRebajas = prendas.some((p) => descuento(p) > 0)
  const maxDescuento = Math.max(0, ...prendas.map(descuento))
  const verRebajas = () => {
    setSoloRebajas(true)
    setCategoria('')
    document.querySelector('.cat-filtros')?.scrollIntoView({ behavior: 'smooth' })
  }

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const lista = prendas.filter(
      (p) =>
        (!soloRebajas || descuento(p) > 0) &&
        (!categoria || p.categoria === categoria) &&
        (!marca || p.marca === marca) &&
        (!talla || p.variantes.some((v) => v.talla === talla)) &&
        (!q || normalizar(`${p.nombre} ${p.marca ?? ''} ${p.categoria ?? ''}`).includes(q)),
    )
    const ordenada = [...lista]
    if (orden === 'menor') ordenada.sort((a, b) => a.precio - b.precio)
    if (orden === 'mayor') ordenada.sort((a, b) => b.precio - a.precio)
    if (orden === 'rebajas') ordenada.sort((a, b) => descuento(b) - descuento(a))
    return ordenada
  }, [prendas, busqueda, categoria, marca, talla, orden, soloRebajas])

  const filtrando = Boolean(busqueda || categoria || marca || talla || soloRebajas)

  return (
    <>
      <section className={`cat-hero ${tienda?.video ? 'cat-hero-con-video' : ''}`}>
        {tienda?.video && (
          <video
            className="cat-hero-video"
            src={urlFoto(tienda.video)}
            poster={tienda.video.startsWith('/video/') ? tienda.video.replace(/\.\w+$/, '.jpg') : undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
        )}
        <img src="/logo.png" alt={tienda?.nombre ?? ''} className="cat-hero-logo" width="150" height="150" />
        <h1 className="cat-hero-nombre">{tienda?.nombre ?? ' '}</h1>
        {tienda?.eslogan && <p className="cat-hero-eslogan">{tienda.eslogan}</p>}
        <div className="cat-redes">
          {tienda?.whatsapp && (
            <a
              href={enlaceWhatsapp(tienda.whatsapp, `Hola ${tienda.nombre} 👋 vi su catálogo y quisiera más información.`)}
              onClick={() =>
                registrar({ tipo: 'general', mensaje: `Hola ${tienda.nombre} 👋 vi su catálogo y quisiera más información.` })
              }
              target="_blank"
              rel="noreferrer"
              className="cat-btn cat-btn-claro"
            >
              <Icono nombre="chat" tam={18} /> WhatsApp
            </a>
          )}
          {tienda?.instagram && (
            <a
              href={`https://instagram.com/${tienda.instagram}`}
              target="_blank"
              rel="noreferrer"
              className="cat-btn cat-btn-contorno"
            >
              <Icono nombre="instagram" tam={18} /> Instagram
            </a>
          )}
        </div>
      </section>

      {hayRebajas && !soloRebajas && (
        <button className="cat-banda-rebajas" onClick={verRebajas}>
          <span className="cat-banda-titulo">Rebajas</span>
          <span>Hasta -{maxDescuento}% en prendas seleccionadas</span>
          <span className="cat-banda-ir">
            Ver <Icono nombre="adelante" tam={16} />
          </span>
        </button>
      )}

      <main className="cat-cuerpo">
        <div className="cat-filtros">
          <div className="buscador">
            <Icono nombre="buscar" />
            <input
              type="search"
              placeholder="Buscar prenda o marca…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar"
            />
          </div>
          {(categorias.length > 1 || hayRebajas) && (
            <nav className="cat-chips" aria-label="Categorías">
              <button
                className={`cat-chip ${!categoria && !soloRebajas ? 'activo' : ''}`}
                onClick={() => {
                  setCategoria('')
                  setSoloRebajas(false)
                }}
              >
                Todo
              </button>
              {hayRebajas && (
                <button
                  className={`cat-chip cat-chip-rebajas ${soloRebajas ? 'activo' : ''}`}
                  onClick={() => setSoloRebajas(!soloRebajas)}
                  aria-pressed={soloRebajas}
                >
                  Rebajas
                </button>
              )}
              {categorias.length > 1 && categorias.map((c) => (
                <button key={c} className={`cat-chip ${categoria === c ? 'activo' : ''}`} onClick={() => setCategoria(c)}>
                  {c}
                </button>
              ))}
            </nav>
          )}
          <div className="cat-selects">
            {tallas.length > 0 && (
              <select value={talla} onChange={(e) => setTalla(e.target.value)} aria-label="Talla">
                <option value="">Todas las tallas</option>
                {tallas.map((t) => (
                  <option key={t} value={t}>
                    Talla {t}
                  </option>
                ))}
              </select>
            )}
            {marcas.length > 1 && (
              <select value={marca} onChange={(e) => setMarca(e.target.value)} aria-label="Marca">
                <option value="">Todas las marcas</option>
                {marcas.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            )}
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Ordenar">
              <option value="recientes">Más recientes</option>
              <option value="menor">Menor precio</option>
              <option value="mayor">Mayor precio</option>
              {hayRebajas && <option value="rebajas">Rebajas</option>}
            </select>
          </div>
          {tablasPara(tienda?.guia_tallas, null).length > 0 && (
            <button className="enlace cat-enlace-guia" onClick={() => setVerGuia(true)}>
              📏 Guía de tallas
            </button>
          )}
          {!cargando && (
            <p className="cat-conteo">
              {visibles.length} prenda{visibles.length === 1 ? '' : 's'}
              {filtrando && (
                <button
                  className="enlace"
                  onClick={() => {
                    setBusqueda('')
                    setCategoria('')
                    setMarca('')
                    setTalla('')
                    setSoloRebajas(false)
                  }}
                >
                  Quitar filtros
                </button>
              )}
            </p>
          )}
        </div>

        {error && <CajaError mensaje={error} reintentar={recargar} />}
        {cargando && prendas.length === 0 && <Cargando />}
        {!cargando && visibles.length === 0 && (
          <div className="vacio">
            <Icono nombre="prendas" tam={32} />
            <div>{prendas.length ? 'No hay prendas con esos filtros.' : 'Pronto tendremos prendas nuevas.'}</div>
          </div>
        )}

        <div className="cat-rejilla">
          {visibles.map((p) => (
            <TarjetaPrenda key={p.id} prenda={p} />
          ))}
        </div>

        <InfoCompra />
        <GuiaTallas categoria={categoria || null} abierta={verGuia} onCerrar={() => setVerGuia(false)} />
      </main>
    </>
  )
}

export function TarjetaPrenda({ prenda: p }: { prenda: PrendaCatalogo }) {
  const d = descuento(p)
  const tallas = [...new Set(p.variantes.map((v) => v.talla).filter(Boolean))].sort((a, b) => ordenTalla(a) - ordenTalla(b))
  return (
    <Link to={`/catalogo/p/${p.id}`} className="cat-tarjeta">
      <div className="cat-tarjeta-foto">
        {p.fotos[0] ? (
          <>
            <img src={urlFoto(p.fotos[0])} alt={p.nombre} loading="lazy" />
            {p.fotos[1] && <img src={urlFoto(p.fotos[1])} alt="" loading="lazy" className="cat-foto-2" />}
          </>
        ) : (
          <div className="cat-sin-foto">
            <img src="/logo-128.png" alt="" width="56" height="56" />
          </div>
        )}
        <div className="cat-insignias">
          {d > 0 && <span className="cat-insignia cat-insignia-rebaja">-{d}%</span>}
          {esNueva(p) && <span className="cat-insignia">Nuevo</span>}
        </div>
      </div>
      <div className="cat-tarjeta-info">
        {p.marca && <span className="cat-marca">{p.marca}</span>}
        <span className="cat-nombre">{p.nombre}</span>
        <span className="cat-precio">
          <span className={d ? 'cat-precio-rebaja' : ''}>{cop(p.precio)}</span>
          {d > 0 && <s>{cop(p.precio_antes!)}</s>}
        </span>
        {tallas.length > 0 && (
          <span className="cat-tallas-mini">
            {tallas.slice(0, 6).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </span>
        )}
      </div>
    </Link>
  )
}
