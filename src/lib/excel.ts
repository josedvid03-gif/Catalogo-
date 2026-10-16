import { strToU8, zipSync } from 'fflate'

/**
 * Generador mínimo de archivos .xlsx (Excel) con varias hojas, títulos en
 * negrilla, columnas con ancho, pesos colombianos y fechas reales de Excel.
 */

export type TipoColumna = 'texto' | 'numero' | 'pesos' | 'fecha' | 'fechaHora' | 'porcentaje'

export interface Columna {
  titulo: string
  tipo?: TipoColumna
  ancho?: number
}

export interface Hoja {
  nombre: string
  columnas: Columna[]
  filas: (string | number | null | undefined)[][]
}

const ESTILO: Record<TipoColumna, number> = { texto: 0, numero: 2, pesos: 3, fecha: 4, porcentaje: 5, fechaHora: 6 }

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // caracteres de control no permitidos en XML
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

function letraColumna(i: number): string {
  let s = ''
  i++
  while (i > 0) {
    const r = (i - 1) % 26
    s = String.fromCharCode(65 + r) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

/** Fecha ISO o AAAA-MM-DD → número de serie de Excel, en hora de Colombia. */
export function serialExcel(valor: string): number | null {
  const fechaSola = /^\d{4}-\d{2}-\d{2}$/.test(valor)
  const d = fechaSola ? new Date(valor + 'T00:00:00-05:00') : new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  const local = d.getTime() - 5 * 3600_000 // Colombia no tiene horario de verano
  return local / 86_400_000 + 25569
}

function hojaXml(h: Hoja): string {
  const cols = h.columnas
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho ?? 16}" customWidth="1"/>`)
    .join('')
  const celda = (ref: string, v: string | number | null | undefined, tipo: TipoColumna, titulo = false) => {
    if (v === null || v === undefined || v === '') return ''
    if (titulo) return `<c r="${ref}" s="1" t="inlineStr"><is><t>${esc(String(v))}</t></is></c>`
    if ((tipo === 'fecha' || tipo === 'fechaHora') && typeof v === 'string') {
      const n = serialExcel(v)
      if (n !== null) return `<c r="${ref}" s="${ESTILO[tipo]}"><v>${n}</v></c>`
    }
    if (typeof v === 'number' && Number.isFinite(v) && tipo !== 'texto') {
      return `<c r="${ref}" s="${ESTILO[tipo]}"><v>${v}</v></c>`
    }
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
  }
  const filas = [
    `<row r="1">${h.columnas.map((c, i) => celda(`${letraColumna(i)}1`, c.titulo, 'texto', true)).join('')}</row>`,
    ...h.filas.map(
      (f, fi) =>
        `<row r="${fi + 2}">${f.map((v, i) => celda(`${letraColumna(i)}${fi + 2}`, v, h.columnas[i]?.tipo ?? 'texto')).join('')}</row>`,
    ),
  ].join('')
  const ultima = `${letraColumna(Math.max(0, h.columnas.length - 1))}${h.filas.length + 1}`
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${filas}</sheetData>` +
    (h.filas.length ? `<autoFilter ref="A1:${ultima}"/>` : '') +
    `</worksheet>`
  )
}

export function crearExcel(hojas: Hoja[]): Uint8Array {
  const nombres = hojas.map((h, i) => {
    const n = h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Hoja ${i + 1}`
    return esc(n)
  })
  const archivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        hojas
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        `</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${nombres.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        `</workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        hojas
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    'xl/styles.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="4">` +
        `<numFmt numFmtId="164" formatCode="&quot;$&quot;\\ #,##0"/>` +
        `<numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd"/>` +
        `<numFmt numFmtId="166" formatCode="0.0%"/>` +
        `<numFmt numFmtId="167" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/>` +
        `</numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFF1E8D4"/><name val="Calibri"/></font></fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FF15130F"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="7">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
        `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`,
    ),
  }
  hojas.forEach((h, i) => {
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(hojaXml(h))
  })
  return zipSync(archivos, { level: 6 })
}

export function descargar(bytes: Uint8Array, nombre: string) {
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
