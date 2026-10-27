import { useEffect, useState } from 'react'
import { mensajeError } from '../lib/supabase'
import { useAvisar } from '../lib/aviso'
import { activar, cambiarPreferencias, desactivar, probar, soporte, suscripcionActual, type Suscripcion } from '../lib/avisos'
import { BotonAccion } from './Comunes'
import { Icono } from './Icono'

/** Ajustes → Notificaciones en este celular (ventas y pedidos del catálogo). */
export function AvisosAjustes() {
  const avisar = useAvisar()
  const puede = soporte()
  const [sub, setSub] = useState<Suscripcion | null | undefined>(undefined)
  const [pref, setPref] = useState({ ventas: true, pedidos: true })
  const [bloqueado, setBloqueado] = useState(puede === 'si' && Notification.permission === 'denied')

  useEffect(() => {
    if (puede !== 'si') return setSub(null)
    suscripcionActual()
      .then((s) => {
        setSub(s)
        if (s) setPref({ ventas: s.ventas, pedidos: s.pedidos })
      })
      .catch(() => setSub(null))
  }, [puede])

  const encender = async () => {
    try {
      setSub(await activar(pref))
      avisar('Notificaciones activadas en este celular')
    } catch (e) {
      if (e instanceof Error && e.message === 'permiso') {
        setBloqueado(Notification.permission === 'denied')
        avisar('No diste permiso para notificaciones', 'error')
      } else if (e instanceof DOMException) {
        // El navegador o el servicio de notificaciones del celular no aceptó el registro.
        avisar('Este celular no pudo registrarse para notificaciones. Revisa que la app tenga permiso e intenta de nuevo.', 'error')
      } else avisar(mensajeError(e), 'error')
    }
  }

  const cambiar = async (p: typeof pref) => {
    setPref(p)
    if (!sub) return
    try {
      await cambiarPreferencias(sub.endpoint, p)
    } catch (e) {
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <section className="tarjeta">
      <h2>Notificaciones en este celular</h2>
      <p className="sutil">
        Te llega un aviso cuando alguien del equipo registra una venta y cuando un cliente envía un pedido desde el catálogo.
        Cada persona las activa en su propio celular.
      </p>

      {puede === 'instalar-iphone' && (
        <div className="alerta-linea alerta-info avisos-pasos">
          <strong>En iPhone primero instala la app:</strong>
          <span>
            1. Abre esta página en Safari. 2. Toca <Icono nombre="compartir" tam={14} /> Compartir → <em>Agregar a inicio</em>.
            3. Abre la app desde el ícono de Alma Fuerte y vuelve aquí.
          </span>
        </div>
      )}
      {puede === 'no' && <p className="sutil">Este navegador no permite notificaciones. Prueba con Chrome o Safari actualizados.</p>}

      {puede === 'si' && bloqueado && !sub && (
        <p className="alerta-linea">
          Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes del celular (Notificaciones → Alma Fuerte o
          el navegador) y vuelve a intentar.
        </p>
      )}

      {puede === 'si' && sub !== undefined && (
        <>
          <label className="interruptor">
            <input type="checkbox" checked={pref.ventas} onChange={(e) => void cambiar({ ...pref, ventas: e.target.checked })} />
            <span>Ventas registradas por el equipo</span>
          </label>
          <label className="interruptor">
            <input type="checkbox" checked={pref.pedidos} onChange={(e) => void cambiar({ ...pref, pedidos: e.target.checked })} />
            <span>Pedidos del catálogo</span>
          </label>

          {sub ? (
            <div className="acciones">
              <span className="etiqueta etiqueta-bien">Activadas</span>
              <BotonAccion
                className="btn btn-sm"
                onClick={async () => {
                  try {
                    await probar(sub.endpoint)
                    avisar('Prueba enviada: debe llegarte en unos segundos')
                  } catch (e) {
                    avisar(mensajeError(e), 'error')
                  }
                }}
              >
                Enviar prueba
              </BotonAccion>
              <BotonAccion
                className="btn btn-sm"
                onClick={async () => {
                  try {
                    await desactivar(sub.endpoint)
                    setSub(null)
                    avisar('Notificaciones desactivadas en este celular')
                  } catch (e) {
                    avisar(mensajeError(e), 'error')
                  }
                }}
              >
                Desactivar
              </BotonAccion>
            </div>
          ) : (
            <BotonAccion className="btn btn-primario" onClick={encender}>
              Activar en este celular
            </BotonAccion>
          )}
          <p className="sutil">Las ventas que registras tú no te llegan como aviso; las de los demás sí.</p>
        </>
      )}
    </section>
  )
}
