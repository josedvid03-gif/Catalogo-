export type MetodoPago = 'efectivo' | 'nequi' | 'transferencia' | 'tarjeta' | 'otro'

export const METODOS: { id: MetodoPago; nombre: string }[] = [
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'nequi', nombre: 'Nequi' },
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
  marca: string | null
  precio_antes: number | null
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
  eslogan: string | null
  info_catalogo: string | null
  pago_nequi: string | null
  pago_titular: string | null
  pago_qr: string | null
  pago_otros: string | null
  envios: string | null
  cambios: string | null
  guia_tallas: TablaTallas[]
  video_portada: string | null
}

/** Una tabla de la guía de tallas (ej. "Buzos y camibuzos"), medidas en cm. */
export interface TablaTallas {
  nombre: string
  /** Categorías a las que aplica, separadas por coma (vacío = todas). */
  categorias: string
  columnas: string[]
  /** Cada fila: [talla, medida1, medida2…] */
  filas: string[][]
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

export interface Gasto {
  id: string
  fecha: string // AAAA-MM-DD
  categoria: string
  descripcion: string | null
  monto: number
  metodo_pago: MetodoPago
  creado_por: string | null
}

export const CATEGORIAS_GASTO = [
  'Arriendo',
  'Servicios',
  'Transporte',
  'Publicidad',
  'Empaques',
  'Sueldos',
  'Comisiones',
  'Otros',
]

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  instagram: string | null
  tallas: string | null
  intereses: string | null
  notas: string | null
  avisar: boolean
  created_at: string
}
