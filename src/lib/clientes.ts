import { supabase, datos } from './supabase'
import type { Cliente } from './types'

const soloDigitos = (t: string) => t.replace(/\D/g, '')

/** "s, M / 32" → ["S", "M", "32"] */
export function tallasDe(texto: string | null | undefined): string[] {
  if (!texto) return []
  return [
    ...new Set(
      texto
        .split(/[,/;\s]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    ),
  ]
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Por qué una prenda le puede interesar a un cliente (vacío = no le interesa). */
export function motivosInteres(
  cliente: Pick<Cliente, 'tallas' | 'intereses'>,
  prenda: { tallas: string[]; marca?: string | null; categoria?: string | null },
): string[] {
  const motivos: string[] = []
  const suyas = tallasDe(cliente.tallas)
  const coinciden = prenda.tallas.filter((t) => suyas.includes(t.trim().toUpperCase()))
  if (coinciden.length) motivos.push(`Talla ${[...new Set(coinciden)].join(', ')}`)
  const intereses = normalizar(cliente.intereses ?? '')
  for (const x of [prenda.marca, prenda.categoria]) {
    if (x && intereses && intereses.includes(normalizar(x)) && !motivos.includes(x)) motivos.push(x)
  }
  return motivos
}

/**
 * Devuelve el id del cliente para una venta o apartado.
 * Si ya se eligió uno de la lista, se usa ese; si se escribió un celular,
 * se busca por celular o se crea el cliente. Sin celular no se crea nada.
 */
export async function vincularCliente(datosCliente: {
  clienteId: string | null
  nombre: string
  telefono: string
}): Promise<string | null> {
  if (datosCliente.clienteId) return datosCliente.clienteId
  const tel = soloDigitos(datosCliente.telefono)
  if (tel.length < 7 || !datosCliente.nombre.trim()) return null
  const conTelefono = datos(
    await supabase.from('clientes').select('id, telefono').not('telefono', 'is', null),
  ) as { id: string; telefono: string }[]
  const ya = conTelefono.find((c) => soloDigitos(c.telefono).endsWith(tel.slice(-10)))
  if (ya) return ya.id
  const nuevo = datos(
    await supabase
      .from('clientes')
      .insert({ nombre: datosCliente.nombre.trim(), telefono: datosCliente.telefono.trim() })
      .select('id')
      .single(),
  ) as { id: string }
  return nuevo.id
}

export function urlPrenda(id: string) {
  return `${window.location.origin}/catalogo/p/${id}`
}
