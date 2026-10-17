import { supabase, datos, mensajeError } from '../lib/supabase'
import { useAvisar } from '../lib/aviso'
import { useAjustes } from '../lib/sesion'
import { enlaceWhatsapp } from '../lib/format'
import { BotonAccion } from './Comunes'
import { Icono } from './Icono'

/**
 * Crea el enlace personal para que el cliente de esta venta deje su opinión
 * y lo abre en WhatsApp (o lo copia si la venta no tiene celular).
 */
export function PedirOpinion({ venta }: { venta: { id: string; cliente: string | null; cliente_id?: string | null } }) {
  const avisar = useAvisar()
  const ajustes = useAjustes()

  const pedir = async () => {
    // Se abre la pestaña de una vez para que el celular no la bloquee después de esperar.
    const pestana = window.open('', '_blank')
    try {
      const { token } = datos(
        await supabase.from('invitaciones_resena').insert({ venta_id: venta.id, nombre: venta.cliente }).select('token').single(),
      ) as { token: string }
      const url = `${window.location.origin}/catalogo/opinar/${token}`
      const nombre = venta.cliente?.trim().split(/\s+/)[0]
      const texto = `Hola${nombre ? ` ${nombre}` : ''} 👋 Gracias por tu compra en ${ajustes.nombre_tienda} 🙌\n¿Nos regalas tu opinión? Toma menos de un minuto y nos ayuda muchísimo:\n${url}`
      let telefono: string | null = null
      if (venta.cliente_id) {
        const c = datos(await supabase.from('clientes').select('telefono').eq('id', venta.cliente_id).maybeSingle()) as {
          telefono: string | null
        } | null
        telefono = c?.telefono ?? null
      }
      if (telefono && pestana) {
        pestana.location.href = enlaceWhatsapp(telefono, texto)
        return
      }
      pestana?.close()
      await navigator.clipboard.writeText(texto)
      avisar('Mensaje copiado. Pégalo en el chat del cliente.')
    } catch (e) {
      pestana?.close()
      avisar(mensajeError(e), 'error')
    }
  }

  return (
    <BotonAccion className="btn btn-bloque" onClick={pedir}>
      <Icono nombre="estrella" tam={16} /> Pedir opinión al cliente
    </BotonAccion>
  )
}
