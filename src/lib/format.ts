const pesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

export const cop = (n: number) => pesos.format(Math.round(n || 0))
export const num = (n: number) => numero.format(Math.round(n || 0))

/** Fecha corta: "16 oct 2026" */
export function fecha(iso: string): string {
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso)
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Fecha y hora: "16 oct, 3:45 p. m." */
export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Fecha de hoy en Colombia como "AAAA-MM-DD". */
export function hoyColombia(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

/** Días que faltan para una fecha "AAAA-MM-DD" (negativo si ya pasó). */
export function diasHasta(fechaISO: string): number {
  const hoy = new Date(hoyColombia() + 'T00:00:00Z').getTime()
  const meta = new Date(fechaISO + 'T00:00:00Z').getTime()
  return Math.round((meta - hoy) / 86_400_000)
}

/** Inicio y fin (exclusivo) de un mes "AAAA-MM" en hora de Colombia, en ISO. */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split('-').map(Number)
  const siguiente = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { desde: `${mes}-01T00:00:00-05:00`, hasta: `${siguiente}-01T00:00:00-05:00` }
}

export function mesActual(): string {
  return hoyColombia().slice(0, 7)
}

export function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const s = new Date(y, m - 1, 15).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function moverMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function varianteTexto(talla: string, color: string): string {
  return [talla, color].filter(Boolean).join(' / ')
}

/** Número de WhatsApp en formato internacional (Colombia por defecto). */
export function numeroWhatsapp(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('3')) return '57' + d
  return d
}

export function enlaceWhatsapp(tel: string, texto: string): string {
  return `https://wa.me/${numeroWhatsapp(tel)}?text=${encodeURIComponent(texto)}`
}

export function margen(costo: number, precio: number): number | null {
  if (!precio) return null
  return Math.round(((precio - costo) / precio) * 100)
}

/** Orden natural de tallas: XS, S, M, L, XL… luego números (6, 8, 10…). */
export function ordenTalla(t: string): number {
  const i = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].indexOf(t.toUpperCase())
  if (i >= 0) return i
  const n = Number(t)
  return Number.isFinite(n) && t.trim() !== '' ? 100 + n : 1000
}

/**
 * Oculta el nombre del titular de Nequi para el catálogo ("Juan García" → "Ju…… Gar……"),
 * igual que lo muestra Nequi al pagar. Si ya viene oculto, lo deja igual.
 */
export function ocultarNombre(nombre: string): string {
  const n = nombre.trim().replace(/\s+/g, ' ')
  if (!n || /[.*…]/.test(n)) return n
  return n
    .split(' ')
    .map((p, i) => (p.length <= 2 ? p : p.slice(0, i === 0 ? 2 : 3) + '……'))
    .join(' ')
}
