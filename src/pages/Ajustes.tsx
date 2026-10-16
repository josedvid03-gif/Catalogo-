import { useEffect, useState } from 'react'
import { supabase, datos, mensajeError } from '../lib/supabase'
import { useCarga } from '../lib/hooks'
import { useAvisar } from '../lib/aviso'
import { useAjustes, useSesion } from '../lib/sesion'
import { BotonAccion, CajaError } from '../components/Comunes'
import { Icono } from '../components/Icono'

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
    try {
      let r = await supabase.from('ajustes').update({ ...basicos, ...catalogo }).eq('id', 1)
      // Si aún no se ejecutó la actualización 02, se guardan solo los datos básicos.
      if (r.error && (r.error.code === 'PGRST204' || r.error.code === '42703')) {
        r = await supabase.from('ajustes').update(basicos).eq('id', 1)
        if (!r.error) avisar('Para guardar los textos del catálogo falta la actualización 02 de la base de datos', 'error')
      }
      datos(r)
      await recargarAjustes()
      avisar('Ajustes guardados')
    } catch (e) {
      avisar(mensajeError(e), 'error')
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
          <span>Información para clientes (envíos, pagos, cambios)</span>
          <textarea
            rows={3}
            value={form.info_catalogo ?? ''}
            placeholder={'Ej: Envíos a toda Colombia 🇨🇴\nPagos por Nequi, Daviplata o transferencia\nCambios hasta 8 días después'}
            onChange={(e) => setForm({ ...form, info_catalogo: e.target.value })}
          />
        </label>
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
