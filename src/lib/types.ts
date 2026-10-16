export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'

export const METODOS: { id: MetodoPago; nombre: string }[] = [
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'transferencia', nombre: 'Transferencia' },
  { id: 'tarjeta', nombre: 'Tarjeta' },
  { id: 'otro', nombre: 'Otro' },
]

export interface Producto {
  id: string
  nombre: string
  descripcion: string | null
  categoria: string | null
  costo: number
  precio: number
  fotos: string[]
  publicado: boolean
  activo: boolean
  created_at: string
}

export interface Variante {
  id: string
  producto_id: string
  talla: string
  color: string
  stock: number
}

/** Fila de la vista "inventario": variante + producto + reservado/disponible. */
export interface ItemInventario {
  id: string
  producto_id: string
  talla: string
  color: string
  stock: number
  reservado: number
  disponible: number
  nombre: string
  categoria: string | null
  costo: number
  precio: number
  fotos: string[]
  activo: boolean
  publicado: boolean
}

export interface Ajustes {
  nombre_tienda: string
  whatsapp: string | null
  instagram: string | null
  porcentaje_anticipo: number
  dias_apartado: number
  stock_minimo: number
}

export interface LineaItem {
  id: string
  descripcion: string
  cantidad: number
  precio_unit: number
}

export interface Venta {
  id: string
  numero: number
  fecha: string
  cliente: string | null
  metodo_pago: MetodoPago
  total: number
  costo_total: number
  nota: string | null
  anulada: boolean
  creado_por: string | null
  venta_items: (LineaItem & { costo_unit: number })[]
}

export type EstadoApartado = 'activo' | 'completado' | 'cancelado'

export interface Apartado {
  id: string
  numero: number
  fecha: string
  fecha_limite: string
  cliente: string
  telefono: string | null
  total: number
  anticipo: number
  metodo_pago_anticipo: MetodoPago
  estado: EstadoApartado
  anticipo_devuelto: boolean
  fecha_cierre: string | null
  nota: string | null
  apartado_items: LineaItem[]
}

/** Línea del carrito al vender o apartar. */
export interface LineaCarrito {
  item: ItemInventario
  cantidad: number
  precio: number
}
