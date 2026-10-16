/**
 * Cálculos de inversiones: cronograma de pagos, plazos y rentabilidad.
 *
 *  - Interés fijo: cada mes se paga monto × tasa% y el capital al terminar el plazo.
 *  - % de ganancias: cada mes se paga tasa% de la ganancia de las ventas de ese mes
 *    (ventas − costo de la ropa vendida) y el capital al terminar el plazo.
 */

export type TipoInversion = 'interes' | 'ganancias'

export interface PagoInversion {
  id: string
  fecha: string // AAAA-MM-DD
  tipo: 'rendimiento' | 'capital'
  monto: number
  periodo: string | null // AAAA-MM (solo ganancias)
  nota: string | null
}

export interface Inversion {
  id: string
  inversor_id: string
  fecha_inicio: string
  monto: number
  tipo: TipoInversion
  tasa: number
  plazo_meses: number
  estado: 'activa' | 'finalizada'
  nota: string | null
  inversores: { nombre: string; telefono: string | null }
  pagos_inversion: PagoInversion[]
}

/** Ganancia de las ventas por día (AAAA-MM-DD → pesos). */
export type GananciaPorDia = Map<string, number>

export type EstadoCuota = 'pagada' | 'parcial' | 'vencida' | 'hoy' | 'pendiente' | 'en-curso' | 'sin-ganancia'

export interface Cuota {
  clave: string
  titulo: string
  fecha: string // fecha en que se debe pagar
  tipo: 'rendimiento' | 'capital'
  monto: number // lo que corresponde pagar
  pagado: number
  estado: EstadoCuota
  periodo?: string // AAAA-MM (ganancias)
  ganancia?: number // ganancia del negocio en ese mes (ganancias)
}

export interface ResumenInversion {
  fin: string
  mesesTranscurridos: number
  mesesRestantes: number
  diasRestantes: number
  cuotas: Cuota[]
  rendimientoGenerado: number // lo que le corresponde hasta hoy
  rendimientoPagado: number
  rendimientoPendiente: number // generado y no pagado
  capitalDevuelto: number
  capitalPendiente: number
  rentabilidadMensual: number // % mensual (real o pactado)
  rentabilidadAnual: number // % efectivo anual
  rentabilidadTotal: number // % sobre el capital: esperado (interés) o acumulado (ganancias)
  totalEsperado: number | null // total de rendimientos al final (solo interés)
  proxima: Cuota | null
  vencidas: Cuota[]
}

const MS_DIA = 86_400_000

export function sumarMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const total = y * 12 + (m - 1) + meses
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const ultimo = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / MS_DIA)
}

function mesesCompletos(desde: string, hasta: string): number {
  let n = 0
  while (n < 1200 && sumarMeses(desde, n + 1) <= hasta) n++
  return n
}

export function fechaColombia(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

/** Agrupa ventas (no anuladas) por día en hora de Colombia. */
export function gananciaPorDia(ventas: { fecha: string; total: number; costo_total: number }[]): GananciaPorDia {
  const m: GananciaPorDia = new Map()
  for (const v of ventas) {
    const d = fechaColombia(v.fecha)
    m.set(d, (m.get(d) ?? 0) + v.total - v.costo_total)
  }
  return m
}

/** Ganancia entre dos fechas: desde incluida, hasta excluida. */
export function gananciaEntre(g: GananciaPorDia, desde: string, hasta: string): number {
  let s = 0
  for (const [d, v] of g) if (d >= desde && d < hasta) s += v
  return s
}

export const anual = (mensualPct: number) => (Math.pow(1 + mensualPct / 100, 12) - 1) * 100

function estadoPorFecha(fecha: string, hoy: string): EstadoCuota {
  if (fecha < hoy) return 'vencida'
  if (fecha === hoy) return 'hoy'
  return 'pendiente'
}

const corta = (f: string) =>
  new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '')

/** "Octubre 2026" si el periodo es un mes calendario; si no, "15 sep – 15 oct". */
function nombrePeriodo(desde: string, hasta: string): string {
  if (desde.endsWith('-01')) {
    const [y, m] = desde.split('-').map(Number)
    const s = new Date(y, m - 1, 15).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return `${corta(desde)} – ${corta(hasta)}`
}

export function resumirInversion(inv: Inversion, hoy: string, ganancias: GananciaPorDia): ResumenInversion {
  const fin = sumarMeses(inv.fecha_inicio, inv.plazo_meses)
  const pagos = inv.pagos_inversion ?? []
  const rendimientoPagado = pagos.filter((p) => p.tipo === 'rendimiento').reduce((s, p) => s + p.monto, 0)
  const capitalDevuelto = pagos.filter((p) => p.tipo === 'capital').reduce((s, p) => s + p.monto, 0)
  const corte = hoy < fin ? hoy : fin
  const mesesTranscurridos = hoy <= inv.fecha_inicio ? 0 : mesesCompletos(inv.fecha_inicio, corte)
  const cuotas: Cuota[] = []
  let rendimientoGenerado = 0

  if (inv.tipo === 'interes') {
    const cuota = Math.round((inv.monto * inv.tasa) / 100)
    let restante = rendimientoPagado
    for (let k = 1; k <= inv.plazo_meses; k++) {
      const fecha = sumarMeses(inv.fecha_inicio, k)
      const pagado = Math.min(cuota, Math.max(0, restante))
      restante -= pagado
      const estado: EstadoCuota =
        cuota > 0 && pagado >= cuota ? 'pagada' : pagado > 0 ? 'parcial' : estadoPorFecha(fecha, hoy)
      if (fecha <= hoy) rendimientoGenerado += cuota
      cuotas.push({ clave: `i${k}`, titulo: `Interés mes ${k}`, fecha, tipo: 'rendimiento', monto: cuota, pagado, estado })
    }
    // Si pagó por adelantado, cuenta como generado lo que ya se pagó.
    rendimientoGenerado = Math.max(rendimientoGenerado, Math.min(rendimientoPagado, cuota * inv.plazo_meses))
  } else {
    // Un periodo por cada mes del plazo, contado desde la fecha de inicio.
    for (let k = 0; k < inv.plazo_meses; k++) {
      const desde = sumarMeses(inv.fecha_inicio, k)
      const hasta = sumarMeses(inv.fecha_inicio, k + 1)
      if (desde > hoy) {
        cuotas.push({
          clave: `g${k}`,
          titulo: `Ganancias ${nombrePeriodo(desde, hasta)}`,
          fecha: hasta,
          tipo: 'rendimiento',
          monto: 0,
          pagado: 0,
          estado: 'pendiente',
          periodo: desde.slice(0, 7),
        })
        continue
      }
      const ganancia = gananciaEntre(ganancias, desde, hasta)
      const parte = Math.max(0, Math.round((ganancia * inv.tasa) / 100))
      const periodo = desde.slice(0, 7)
      const pagado = pagos
        .filter((p) => p.tipo === 'rendimiento' && p.periodo === periodo)
        .reduce((s, p) => s + p.monto, 0)
      rendimientoGenerado += parte
      const cerrado = hasta <= hoy
      const estado: EstadoCuota = !cerrado
        ? 'en-curso'
        : parte === 0 && pagado === 0
          ? 'sin-ganancia'
          : pagado >= parte
            ? 'pagada'
            : pagado > 0
              ? 'parcial'
              : estadoPorFecha(hasta, hoy)
      cuotas.push({
        clave: `g${k}`,
        titulo: `Ganancias ${nombrePeriodo(desde, hasta)}`,
        fecha: hasta,
        tipo: 'rendimiento',
        monto: parte,
        pagado,
        estado,
        periodo,
        ganancia,
      })
    }
  }

  const capitalPagado = Math.min(capitalDevuelto, inv.monto)
  cuotas.push({
    clave: 'capital',
    titulo: 'Devolución del capital',
    fecha: fin,
    tipo: 'capital',
    monto: inv.monto,
    pagado: capitalPagado,
    estado: capitalPagado >= inv.monto ? 'pagada' : capitalPagado > 0 ? 'parcial' : estadoPorFecha(fin, hoy),
  })

  const pendienteDe = (c: Cuota) => c.monto - c.pagado
  const porPagar = (c: Cuota) =>
    pendienteDe(c) > 0 && ['vencida', 'hoy', 'parcial', 'pendiente'].includes(c.estado)
  const vencidas = cuotas.filter((c) => pendienteDe(c) > 0 && (c.estado === 'vencida' || c.estado === 'hoy' || (c.estado === 'parcial' && c.fecha <= hoy)))
  const proxima = cuotas.filter(porPagar).sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null

  let rentabilidadMensual: number
  let rentabilidadTotal: number
  let totalEsperado: number | null = null
  if (inv.tipo === 'interes') {
    rentabilidadMensual = inv.tasa
    rentabilidadTotal = inv.tasa * inv.plazo_meses
    totalEsperado = Math.round((inv.monto * inv.tasa) / 100) * inv.plazo_meses
  } else {
    const dias = Math.max(1, diasEntre(inv.fecha_inicio, corte))
    const meses = dias / 30.4375
    rentabilidadTotal = (rendimientoGenerado / inv.monto) * 100
    rentabilidadMensual = hoy > inv.fecha_inicio ? rentabilidadTotal / Math.max(meses, 1) : 0
  }

  return {
    fin,
    mesesTranscurridos,
    mesesRestantes: Math.max(0, inv.plazo_meses - mesesTranscurridos),
    diasRestantes: Math.max(0, diasEntre(hoy, fin)),
    cuotas,
    rendimientoGenerado,
    rendimientoPagado,
    rendimientoPendiente: Math.max(0, rendimientoGenerado - rendimientoPagado),
    capitalDevuelto,
    capitalPendiente: Math.max(0, inv.monto - capitalDevuelto),
    rentabilidadMensual,
    rentabilidadAnual: anual(rentabilidadMensual),
    rentabilidadTotal,
    totalEsperado,
    proxima,
    vencidas,
  }
}

/** Lo que corresponde a inversores dentro de un mes calendario (AAAA-MM). */
export function rendimientoDelMes(inv: Inversion, mes: string, ganancias: GananciaPorDia): number {
  const fin = sumarMeses(inv.fecha_inicio, inv.plazo_meses)
  if (inv.tipo === 'interes') {
    let s = 0
    for (let k = 1; k <= inv.plazo_meses; k++) {
      if (sumarMeses(inv.fecha_inicio, k).slice(0, 7) === mes) s += Math.round((inv.monto * inv.tasa) / 100)
    }
    return s
  }
  const desde = `${mes}-01` < inv.fecha_inicio ? inv.fecha_inicio : `${mes}-01`
  const finMes = sumarMeses(`${mes}-01`, 1)
  const hasta = finMes > fin ? fin : finMes
  if (desde >= hasta) return 0
  return Math.max(0, Math.round((gananciaEntre(ganancias, desde, hasta) * inv.tasa) / 100))
}

export const NOMBRE_ESTADO: Record<EstadoCuota, string> = {
  pagada: 'Pagado',
  parcial: 'Pago parcial',
  vencida: 'Vencido',
  hoy: 'Vence hoy',
  pendiente: 'Pendiente',
  'en-curso': 'Mes en curso',
  'sin-ganancia': 'Sin ganancia',
}
