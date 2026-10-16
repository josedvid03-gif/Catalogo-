import { supabase, datos } from './supabase'
import { gananciaPorDia, type GananciaPorDia, type Inversion } from './inversiones'

export interface DatosInversiones {
  inversiones: Inversion[]
  ganancias: GananciaPorDia
}

const SELECT = '*, inversores(nombre, telefono), pagos_inversion(*)'

/** Ganancia neta (ventas − costo − gastos) por día desde una fecha (AAAA-MM-DD). */
async function cargarGanancias(desde: string | null): Promise<GananciaPorDia> {
  if (!desde) return new Map()
  const [ventas, gastos] = await Promise.all([
    supabase.from('ventas').select('fecha, total, costo_total').eq('anulada', false).gte('fecha', `${desde}T00:00:00-05:00`),
    supabase.from('gastos').select('fecha, monto').gte('fecha', desde),
  ])
  // Si la tabla de gastos aún no existe (falta la actualización), se calcula sin gastos.
  const listaGastos = gastos.error ? [] : (gastos.data as { fecha: string; monto: number }[])
  return gananciaPorDia(datos(ventas) as { fecha: string; total: number; costo_total: number }[], listaGastos)
}

export async function cargarInversiones(desdeMes?: string): Promise<DatosInversiones> {
  const inversiones = datos(
    await supabase.from('inversiones').select(SELECT).order('fecha_inicio', { ascending: false }),
  ) as Inversion[]
  const fechas = inversiones.filter((i) => i.tipo === 'ganancias').map((i) => i.fecha_inicio)
  if (desdeMes) fechas.push(`${desdeMes}-01`)
  const desde = fechas.length ? fechas.sort()[0] : null
  return { inversiones, ganancias: await cargarGanancias(desde) }
}

export async function cargarInversion(id: string): Promise<DatosInversiones> {
  const inv = datos(await supabase.from('inversiones').select(SELECT).eq('id', id).single()) as Inversion
  return { inversiones: [inv], ganancias: await cargarGanancias(inv.tipo === 'ganancias' ? inv.fecha_inicio : null) }
}
