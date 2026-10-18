import { useEffect, useState } from 'react'
import { supabase, datos, mensajeError, urlFoto } from '../lib/supabase'
import { borrarFotos, subirFoto, subirVideo } from '../lib/imagenes'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { useAjustes, useSesion } from '../lib/sesion'
import { ocultarNombre } from '../lib/format'
import { BotonAccion, CajaError } from '../components/Comunes'
import { Icono } from '../components/Icono'
import { AsesoresAjustes } from '../components/AsesoresAjustes'
import { GuiaTallasAjustes, limpiarGuia } from '../components/GuiaTallasAjustes'
import { CampanaAjustes } from '../components/CampanaAjustes'

export function Ajustes() {
  const avisar = useAvisar()
  const { session, salir, recargarAjustes } = useSesion()
  const actual = useAjustes()
  const [form, setForm] = useState(actual)
  const [nuevoEmail, setNuevoEmail] = useState('')

  useEffect(() => setForm(actual), [actual])

  const equipo = useCarga(
    async () =>
      datos(await supabase.from('equipo').select('email, nombre').order('created_at')) as {
        email: string
        nombre: string | null
      }[],
  )

  const urlCatalogo = `${window.location.origin}/catalogo`

  const guardar = async () => {
    const basicos = {
      nombre_tienda: form.nombre_tienda.trim() || 'Mi Tienda',
      whatsapp: form.whatsapp?.trim() || null,
      instagram: form.instagram?.trim().replace(/^@/, '') || null,
      porcentaje_anticipo: form.porcentaje_anticipo,
      dias_apartado: form.dias_apartado,
      stock_minimo: form.stock_minimo,
    }
    const catalogo = {
      eslogan: form.eslogan?.trim() || null,
      info_catalogo: form.info_catalogo?.trim() || null,
    }
    const pagos = {
      pago_nequi: form.pago_nequi?.trim() || null,
      pago_titular: ocultarNombre(form.pago_titular ?? '') || null,
      pago_qr: form.pago_qr || null,
      pago_otros: form.pago_otros?.trim() || null,
    }
    const extras = {
      envios: form.envios?.trim() || null,
      cambios: form.cambios?.trim() || null,
      guia_tallas: limpiarGuia(form.guia_tallas ?? []),
    }
    const prenda = {
      sellos: (form.sellos ?? []).map((s) => s.trim()).filter(Boolean),
      frase_prenda: form.frase_prenda?.trim() || null,
    }
    const campana = { campana: (form.campana ?? []).map((f) => ({ ...f, titulo: f.titulo.trim() })) }
    const falta = (e: { code?: string } | null) => e && (e.code === 'PGRST204' || e.code === '42703')
    try {
      // Se intenta guardar todo; si faltan actualizaciones de la base de datos, se guarda lo que se pueda.
      let r = await supabase
        .from('ajustes')
        .update({ ...basicos, ...catalogo, ...pagos, ...extras, ...prenda, ...campana })
        .eq('id', 1)
      if (falta(r.error)) {
        r = await supabase.from('ajustes').update({ ...basicos, ...catalogo, ...pagos, ...extras, ...prenda }).eq('id', 1)
        if (!r.error) avisar('Para guardar la campaña falta la actualización 08 de la base de datos', 'error')
      }
      if (falta(r.error)) {
        r = await supabase.from('ajustes').update({ ...basicos, ...catalogo, ...pagos, ...extras }).eq('id', 1)
        if (!r.error) avisar('Para guardar los sellos y la frase falta la actualización 06 de la base de datos', 'error')
      }
      if (falta(r.error)) {
        r = await supabase.from('ajustes').update({ ...basicos, ...catalogo, ...pagos }).eq('id', 1)
        if (!r.error)
          avisar('Para guardar envíos, cambios y guía de tallas falta la actualización 05 de la base de datos', 'error')
      }
      if (falta(r.error)) {
        r = await supabase.from('ajustes').update({ ...basicos, ...catalogo }).eq('id', 1)
        if (!r.error) avisar('Para guardar los datos de Nequi falta la actualización 03 de la base de datos', 'error')
      }
      if (falta(r.error)) {
        r = await supabase.from('ajustes').update(basicos).eq('id', 1)
        if (!r.error) avisar('Para guardar los textos del catálogo falta la actualización 02 de la base de datos', 'error')
      }
      datos(r)
      setForm((f) => ({ ...f, pago_titular: pagos.pago_titular, guia_tallas: extras.guia_tallas }))
      await recargarAjustes()
      avisar('Ajustes guardados')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const [subiendoVideo, setSubiendoVideo] = useState(false)
  const cambiarVideo = async (archivo?: File) => {
    if (archivo && archivo.size > 45 * 1024 * 1024) {
      return avisar('El video pesa más de 45 MB. Usa uno más corto (10–20 segundos).', 'error')
    }
    setSubiendoVideo(true)
    try {
      const ruta = archivo ? await subirVideo(archivo) : null
      datos(await supabase.from('ajustes').update({ video_portada: ruta }).eq('id', 1))
      if (form.video_portada && !form.video_portada.startsWith('/')) await borrarFotos([form.video_portada]).catch(() => undefined)
      setForm((f) => ({ ...f, video_portada: ruta }))
      await recargarAjustes()
      avisar(ruta ? 'Video puesto en la portada del catálogo' : 'Video quitado')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setSubiendoVideo(false)
    }
  }

  const [subiendoQr, setSubiendoQr] = useState(false)
  const subirQr = async (archivo?: File) => {
    if (!archivo) return
    setSubiendoQr(true)
    try {
      const ruta = await subirFoto('tienda', archivo)
      setForm((f) => ({ ...f, pago_qr: ruta }))
      avisar('QR cargado. Toca "Guardar ajustes" para que salga en el catálogo')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setSubiendoQr(false)
    }
  }

  const agregarMiembro = async () => {
    const email = nuevoEmail.trim().toLowerCase()
    if (!email.includes('@')) return avisar('Escribe un correo válido', 'error')
    try {
      datos(await supabase.from('equipo').insert({ email }))
      setNuevoEmail('')
      avisar('Correo agregado. Ahora crea su usuario en Supabase (ver README)')
      await equipo.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const quitarMiembro = async (email: string) => {
    if (email.toLowerCase() === session?.user.email?.toLowerCase()) {
      return avisar('No puedes quitarte a ti mismo', 'error')
    }
    if (!confirm(`¿Quitar el acceso de ${email}?`)) return
    try {
      datos(await supabase.from('equipo').delete().eq('email', email))
      await equipo.recargar()
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  const compartir = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: actual.nombre_tienda, text: 'Mira nuestro catálogo', url: urlCatalogo })
      } else {
        await navigator.clipboard.writeText(urlCatalogo)
        avisar('Enlace copiado')
      }
    } catch {
      /* el usuario canceló */
    }
  }

  const numero = (v: string, max: number) => Math.min(max, Number(v.replace(/\D/g, '') || 0))

  return (
    <div className="pagina formulario">
      <div className="titulo-pagina">
        <h1>Ajustes</h1>
      </div>

      <section className="tarjeta">
        <h2>Catálogo para clientes</h2>
        <p className="sutil">Comparte este enlace por WhatsApp o Instagram. Solo muestra fotos, precios y tallas disponibles.</p>
        <div className="enlace-catalogo">
          <code>{urlCatalogo}</code>
        </div>
        <div className="acciones">
          <button className="btn" onClick={compartir}>
            <Icono nombre="compartir" tam={16} /> Compartir
          </button>
          <a className="btn" href="/catalogo" target="_blank" rel="noreferrer">
            <Icono nombre="ojo" tam={16} /> Ver catálogo
          </a>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Tienda</h2>
        <label className="campo">
          <span>Nombre de la tienda</span>
          <input value={form.nombre_tienda} onChange={(e) => setForm({ ...form, nombre_tienda: e.target.value })} />
        </label>
        <label className="campo">
          <span>WhatsApp de la tienda (los clientes te escriben aquí)</span>
          <input
            type="tel"
            inputMode="tel"
            placeholder="300 123 4567"
            value={form.whatsapp ?? ''}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
        </label>
        <label className="campo">
          <span>Instagram (sin @)</span>
          <input value={form.instagram ?? ''} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
        </label>
        <label className="campo">
          <span>Frase bajo el nombre (catálogo)</span>
          <input
            value={form.eslogan ?? ''}
            placeholder="Original Supply · Colombia"
            onChange={(e) => setForm({ ...form, eslogan: e.target.value })}
          />
        </label>
        <label className="campo">
          <span>Información general para clientes (sale al final del catálogo)</span>
          <textarea
            rows={2}
            value={form.info_catalogo ?? ''}
            placeholder="Ej: Ropa 100% original · Tienda en Medellín, Cra 43 # 10-20"
            onChange={(e) => setForm({ ...form, info_catalogo: e.target.value })}
          />
        </label>
      </section>

      <section className="tarjeta">
        <h2>Pagos (se muestran en el catálogo)</h2>
        <p className="sutil">
          Cuando un cliente arma su pedido, el catálogo le muestra cómo pagarte. Primero te escribe por WhatsApp, tú le
          confirmas que hay disponibilidad, paga y te manda el comprobante.
        </p>
        <div className="dos-columnas">
          <label className="campo">
            <span>Número de Nequi</span>
            <input
              type="tel"
              inputMode="tel"
              placeholder="300 123 4567"
              value={form.pago_nequi ?? ''}
              onChange={(e) => setForm({ ...form, pago_nequi: e.target.value })}
            />
          </label>
          <label className="campo">
            <span>A nombre de</span>
            <input
              placeholder="Nombre del titular"
              value={form.pago_titular ?? ''}
              onChange={(e) => setForm({ ...form, pago_titular: e.target.value })}
            />
            {form.pago_titular?.trim() && (
              <small className="sutil">
                Por seguridad se guarda y se muestra oculto: <strong>{ocultarNombre(form.pago_titular)}</strong>
              </small>
            )}
          </label>
        </div>
        <div className="campo">
          <span>Código QR de Nequi (opcional)</span>
          <div className="qr-editor">
            {form.pago_qr ? (
              <img src={urlFoto(form.pago_qr)} alt="QR de Nequi" />
            ) : (
              <div className="qr-vacio">Sin QR</div>
            )}
            <div className="acciones">
              <label className="btn btn-sm">
                {subiendoQr ? 'Subiendo…' : form.pago_qr ? 'Cambiar QR' : 'Subir QR'}
                <input type="file" accept="image/*" hidden onChange={(e) => void subirQr(e.target.files?.[0])} />
              </label>
              {form.pago_qr && (
                <button className="btn btn-sm btn-peligro-suave" onClick={() => setForm({ ...form, pago_qr: null })}>
                  Quitar
                </button>
              )}
            </div>
          </div>
          <span className="sutil">Sácalo de la app de Nequi (la opción para cobrar con QR) y sube la imagen o una captura.</span>
        </div>
        <label className="campo">
          <span>Otros medios de pago (opcional)</span>
          <textarea
            rows={2}
            placeholder="Ej: Daviplata 300 123 4567 · Efectivo contra entrega en Bogotá"
            value={form.pago_otros ?? ''}
            onChange={(e) => setForm({ ...form, pago_otros: e.target.value })}
          />
        </label>
        <BotonAccion className="btn btn-primario" onClick={guardar}>
          Guardar ajustes
        </BotonAccion>
      </section>

      <section className="tarjeta">
        <h2>Video de portada del catálogo</h2>
        <p className="sutil">
          Se ve de fondo detrás del logo, sin sonido y en repetición. Usa un video corto (10–20 segundos), horizontal y en
          formato MP4. Si no hay video, se ve el fondo negro.
        </p>
        {form.video_portada && (
          <video className="video-vista" src={urlFoto(form.video_portada)} muted loop autoPlay playsInline />
        )}
        <div className="acciones">
          <label className={`btn ${subiendoVideo ? 'deshabilitado' : ''}`}>
            <Icono nombre="camara" tam={16} /> {subiendoVideo ? 'Subiendo…' : form.video_portada ? 'Cambiar video' : 'Subir video'}
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              hidden
              disabled={subiendoVideo}
              onChange={(e) => {
                void cambiarVideo(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {form.video_portada && (
            <BotonAccion className="btn" onClick={() => cambiarVideo()}>
              <Icono nombre="basura" tam={16} /> Quitar video
            </BotonAccion>
          )}
        </div>
      </section>

      <section className="tarjeta">
        <h2>Campaña (fotos del inicio)</h2>
        <p className="sutil">
          Salen en el catálogo como "La campaña", debajo del video. Fotos verticales se ven mejor. Cada una puede llevar a una
          categoría, a una prenda o a las rebajas.
        </p>
        <CampanaAjustes valor={form.campana ?? []} onChange={(c) => setForm({ ...form, campana: c })} />
        <BotonAccion className="btn btn-primario" onClick={guardar}>
          Guardar ajustes
        </BotonAccion>
      </section>

      <section className="tarjeta">
        <h2>Envíos y cambios</h2>
        <p className="sutil">Se muestran en el catálogo y en cada prenda, para que el cliente compre con confianza.</p>
        <label className="campo">
          <span>Envíos</span>
          <textarea
            rows={4}
            value={form.envios ?? ''}
            placeholder={EJEMPLO_ENVIOS}
            onChange={(e) => setForm({ ...form, envios: e.target.value })}
          />
        </label>
        {!form.envios && (
          <button type="button" className="enlace" onClick={() => setForm({ ...form, envios: EJEMPLO_ENVIOS })}>
            Usar texto de ejemplo y editarlo
          </button>
        )}
        <label className="campo">
          <span>Cambios</span>
          <textarea
            rows={4}
            value={form.cambios ?? ''}
            placeholder={EJEMPLO_CAMBIOS}
            onChange={(e) => setForm({ ...form, cambios: e.target.value })}
          />
        </label>
        {!form.cambios && (
          <button type="button" className="enlace" onClick={() => setForm({ ...form, cambios: EJEMPLO_CAMBIOS })}>
            Usar texto de ejemplo y editarlo
          </button>
        )}
        <BotonAccion className="btn btn-primario" onClick={guardar}>
          Guardar ajustes
        </BotonAccion>
      </section>

      <section className="tarjeta">
        <h2>Página de cada prenda</h2>
        <label className="campo">
          <span>Frase de impulso (sale destacada en cada prenda)</span>
          <input
            value={form.frase_prenda ?? ''}
            placeholder="¡Llévala hoy antes de que se agote!"
            onChange={(e) => setForm({ ...form, frase_prenda: e.target.value })}
          />
        </label>
        <div className="campo">
          <span>Sellos de confianza (máximo 4, cortos)</span>
          {(form.sellos ?? []).map((s, i) => (
            <div key={i} className="fila-sello">
              <input
                value={s}
                maxLength={28}
                onChange={(e) => setForm({ ...form, sellos: form.sellos.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <button
                type="button"
                className="btn-icono"
                aria-label={`Quitar sello ${s}`}
                onClick={() => setForm({ ...form, sellos: form.sellos.filter((_, j) => j !== i) })}
              >
                <Icono nombre="cerrar" tam={16} />
              </button>
            </div>
          ))}
          {(form.sellos ?? []).length < 4 && (
            <button type="button" className="enlace" onClick={() => setForm({ ...form, sellos: [...(form.sellos ?? []), ''] })}>
              + Agregar sello
            </button>
          )}
          <small className="sutil">
            Ideas: 100% original · Pago seguro · Envíos a toda Colombia · Cambios fáciles · Atención por WhatsApp. Pon
            solo lo que de verdad ofreces.
          </small>
        </div>
        <BotonAccion className="btn btn-primario" onClick={guardar}>
          Guardar ajustes
        </BotonAccion>
      </section>

      <section className="tarjeta">
        <h2>Guía de tallas</h2>
        <p className="sutil">
          Aparece como "📏 Guía de tallas" en el catálogo y en cada prenda (con la tabla de su categoría). Medidas en cm
          con la prenda en plano. Si usas la de ejemplo, revisa las medidas con tus prendas.
        </p>
        <GuiaTallasAjustes valor={form.guia_tallas ?? []} onChange={(g) => setForm({ ...form, guia_tallas: g })} />
        <BotonAccion className="btn btn-primario" onClick={guardar}>
          Guardar ajustes
        </BotonAccion>
      </section>

      <section className="tarjeta">
        <h2>Apartados e inventario</h2>
        <div className="dos-columnas">
          <label className="campo">
            <span>% de anticipo sugerido</span>
            <input
              inputMode="numeric"
              value={String(form.porcentaje_anticipo)}
              onChange={(e) => setForm({ ...form, porcentaje_anticipo: numero(e.target.value, 100) })}
            />
          </label>
          <label className="campo">
            <span>Días para recoger</span>
            <input
              inputMode="numeric"
              value={String(form.dias_apartado)}
              onChange={(e) => setForm({ ...form, dias_apartado: Math.max(1, numero(e.target.value, 365)) })}
            />
          </label>
        </div>
        <label className="campo">
          <span>Avisar "poco stock" cuando queden</span>
          <input
            inputMode="numeric"
            value={String(form.stock_minimo)}
            onChange={(e) => setForm({ ...form, stock_minimo: numero(e.target.value, 999) })}
          />
        </label>
        <BotonAccion className="btn btn-primario" onClick={guardar}>
          Guardar ajustes
        </BotonAccion>
      </section>

      <AsesoresAjustes />

      <section className="tarjeta">
        <h2>Equipo</h2>
        <p className="sutil">Correos que pueden entrar a la app.</p>
        {equipo.error && <CajaError mensaje={equipo.error} reintentar={equipo.recargar} />}
        <ul className="lista-equipo">
          {(equipo.data ?? []).map((m) => (
            <li key={m.email}>
              <span>{m.email}</span>
              <button className="btn-icono" aria-label={`Quitar ${m.email}`} onClick={() => quitarMiembro(m.email)}>
                <Icono nombre="basura" />
              </button>
            </li>
          ))}
        </ul>
        <div className="fila-agregar">
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={nuevoEmail}
            onChange={(e) => setNuevoEmail(e.target.value)}
            aria-label="Correo nuevo"
          />
          <BotonAccion className="btn" onClick={agregarMiembro}>
            Agregar
          </BotonAccion>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Sesión</h2>
        <p className="sutil">Conectado como {session?.user.email}</p>
        <button className="btn" onClick={salir}>
          <Icono nombre="salir" tam={16} /> Cerrar sesión
        </button>
      </section>
    </div>
  )
}

const EJEMPLO_ENVIOS = `Envíos a toda Colombia 🇨🇴
Llega en 2 a 5 días hábiles según tu ciudad.
El valor del envío te lo confirmamos por WhatsApp antes de pagar.
Despachamos el mismo día si pagas antes de las 3:00 p. m.`

const EJEMPLO_CAMBIOS = `Cambios de talla hasta 5 días hábiles después de recibir tu pedido.
La prenda debe estar sin usar, sin lavar y con sus etiquetas.
Escríbenos por WhatsApp para coordinar el cambio.`
