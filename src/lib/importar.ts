/**
 * Convierte una lista pegada desde Excel / Google Sheets (o un archivo CSV)
 * en filas de productos: nombre, talla, precio, costo, categoría y cantidad.
 */

export interface FilaImportada {
  clave: string
  incluir: boolean
  nombre: string
  talla: string
  categoria: string
  precio: number
  costo: number
  cantidad: number
  original: string
}

/** Separa el texto en celdas. Acepta tabulaciones (copiar/pegar) o CSV con comillas. */
export function leerTabla(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const primera = limpio.split('\n').find((l) => l.trim()) ?? ''
  const sep = primera.includes('\t') ? '\t' : primera.split(';').length > primera.split(',').length ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') comillas = false
      else celda += c
    } else if (c === '"' && celda === '') comillas = true
    else if (c === sep) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n') {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  fila.push(celda)
  filas.push(fila)
  return filas.map((f) => f.map((c) => c.trim())).filter((f) => f.some((c) => c !== ''))
}

/** "250.000", "$ 250,000", "250000", "250.000,00" → 250000. Devuelve null si no es un número. */
export function leerPesos(valor: string): number | null {
  let v = valor.replace(/[$\s]|COP/gi, '')
  if (!v || !/^\d[\d.,]*$/.test(v)) return null
  v = v.replace(/[.,]00$/, '')
  if (/^\d{1,3}([.,]\d{3})+$/.test(v)) v = v.replace(/[.,]/g, '')
  else if (/^\d+[.,]\d{1,2}$/.test(v)) v = v.replace(',', '.')
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

const PALABRAS_MENORES = new Set(['de', 'del', 'la', 'el', 'las', 'los', 'y', 'en', 'con', 'sin', 'para', 'por', 'a'])
const CORRECCIONES: Record<string, string> = {
  cmiseta: 'camiseta',
  camisetas: 'camiseta',
  pantalon: 'pantalón',
  pantalones: 'pantalón',
  chaquetas: 'chaqueta',
  gorras: 'gorra',
}

/** "CAMISETA NIKE AF1" → "Camiseta Nike AF1" (respeta siglas y números). */
export function formatoNombre(texto: string): string {
  const letras = texto.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '')
  const enMayusculas = letras.length > 0 && letras === letras.toUpperCase()
  if (!enMayusculas) return texto
  return texto
    .toLowerCase()
    .split(/(\s+)/)
    .map((p, i) => {
      if (/^\s+$/.test(p) || !p) return p
      if (PALABRAS_MENORES.has(p)) return i > 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)
      // Siglas y referencias: AF1, 97, L.A, NY
      if (/\d/.test(p) || p.includes('.') || p.length <= 2) return p.toUpperCase()
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join('')
}

/** Saca la talla del nombre: "Jean azul talla 28 negro" → { nombre: "Jean azul negro", talla: "28" } */
export function separarTalla(texto: string): { nombre: string; talla: string } {
  const m = texto.match(/\btalla\s*[:.]?\s*([A-Za-z]{1,4}|\d{1,2}(?:[.,]\d)?)\b/i)
  if (!m) return { nombre: texto.trim(), talla: '' }
  const nombre = (texto.slice(0, m.index) + ' ' + texto.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim()
  return { nombre, talla: m[1].toUpperCase() }
}

export function adivinarCategoria(nombre: string): string {
  const primera = nombre
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (!primera || /\d/.test(primera)) return ''
  const palabra = CORRECCIONES[primera] ?? primera
  return palabra.charAt(0).toUpperCase() + palabra.slice(1)
}

export interface Columnas {
  nombre: number
  precio: number
  costo: number // -1 = no hay
  cantidad: number // -1 = no hay
}

/** Adivina qué columna es el nombre (más texto) y cuál el precio (más números). */
export function adivinarColumnas(tabla: string[][]): Columnas {
  const ancho = Math.max(0, ...tabla.map((f) => f.length))
  const textos = Array(ancho).fill(0)
  const numeros = Array(ancho).fill(0)
  for (const f of tabla) {
    f.forEach((c, i) => {
      if (!c) return
      const n = leerPesos(c)
      if (n !== null) {
        if (n >= 1000) numeros[i]++
      } else if (/[a-zA-Z]/.test(c)) textos[i]++
    })
  }
  const mejor = (arr: number[], excluir: number[] = []) => {
    let idx = -1
    arr.forEach((v, i) => {
      if (v > 0 && !excluir.includes(i) && (idx === -1 || v > arr[idx])) idx = i
    })
    return idx
  }
  const nombre = Math.max(0, mejor(textos))
  const precio = mejor(numeros, [nombre])
  return { nombre, precio, costo: -1, cantidad: -1 }
}

/** ¿La primera fila parece un encabezado (Nombre, Precio…) y no un producto? */
export function tieneEncabezado(tabla: string[][], cols: Columnas): boolean {
  const f = tabla[0]
  if (!f) return false
  const precio = cols.precio >= 0 ? leerPesos(f[cols.precio] ?? '') : null
  return precio === null && /nombre|producto|prenda|descripci|art[ií]culo|precio/i.test(f.join(' '))
}

export function convertirFilas(
  tabla: string[][],
  cols: Columnas,
  opciones: { saltarPrimera: boolean; formatear: boolean; unirIguales: boolean },
): FilaImportada[] {
  const filas: FilaImportada[] = []
  tabla.forEach((f, i) => {
    if (i === 0 && opciones.saltarPrimera) return
    const bruto = f[cols.nombre] ?? ''
    if (!/[a-zA-ZÁÉÍÓÚÑáéíóúñ]/.test(bruto)) return
    const { nombre, talla } = separarTalla(bruto)
    const nombreFinal = opciones.formatear ? formatoNombre(nombre) : nombre
    const cantidad = cols.cantidad >= 0 ? leerPesos(f[cols.cantidad] ?? '') : null
    filas.push({
      clave: `f${i}`,
      incluir: true,
      nombre: nombreFinal,
      talla,
      categoria: adivinarCategoria(nombreFinal),
      precio: (cols.precio >= 0 ? leerPesos(f[cols.precio] ?? '') : null) ?? 0,
      costo: (cols.costo >= 0 ? leerPesos(f[cols.costo] ?? '') : null) ?? 0,
      cantidad: cantidad && cantidad > 0 && cantidad < 10000 ? cantidad : 1,
      original: bruto,
    })
  })
  if (!opciones.unirIguales) return filas

  // Filas idénticas (mismo nombre, talla y precio) = un producto con más unidades.
  const unidas = new Map<string, FilaImportada>()
  for (const fila of filas) {
    const llave = `${fila.nombre.toLowerCase()}|${fila.talla}|${fila.precio}|${fila.costo}`
    const ya = unidas.get(llave)
    if (ya) ya.cantidad += fila.cantidad
    else unidas.set(llave, { ...fila })
  }
  return [...unidas.values()]
}
