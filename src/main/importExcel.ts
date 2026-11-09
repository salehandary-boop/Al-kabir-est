import ExcelJS from 'exceljs'
import type { Db } from './db'
import { addItem, addPart, addSection } from './db/boq'

export type CellValue = string | number | null

export interface SheetRows {
  name: string
  rows: CellValue[][]
}

export interface ParsedItem {
  code: string
  description: string
  unit: string
  quantity: string
  rate: string
  remarks: string
}

export interface ParsedSection {
  code: string
  title: string
  items: ParsedItem[]
}

export interface ParsedPart {
  code: string
  name: string
  sheet: string
  sections: ParsedSection[]
}

/** Reads an .xlsx file into plain rows. Formula cells give their last calculated value. */
export async function readWorkbook(file: string): Promise<SheetRows[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  return wb.worksheets.map((ws) => {
    const rows: CellValue[][] = []
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const cells: CellValue[] = []
      for (let c = 1; c <= ws.columnCount; c++) cells.push(plain(row.getCell(c).value))
      rows[n - 1] = cells
    })
    for (let i = 0; i < rows.length; i++) rows[i] ??= []
    return { name: ws.name, rows }
  })
}

function plain(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('result' in v) return plain((v as { result: ExcelJS.CellValue }).result)
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('')
    if ('text' in v) return String((v as { text: unknown }).text)
  }
  return String(v)
}

const text = (v: CellValue | undefined) => (v === null || v === undefined ? '' : String(v).trim())

function findHeader(rows: CellValue[][]) {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = rows[r].map((c) => text(c).toLowerCase())
    const col = (re: RegExp) => cells.findIndex((c) => re.test(c))
    const item = col(/^(item|no\.?|ref|code)/)
    const desc = col(/desc/)
    const unit = col(/^unit$|^unit\b(?!.*rate)/)
    const qty = col(/^(qty|quantity|quant)/)
    if (desc >= 0 && unit >= 0 && qty >= 0) {
      return { row: r, item, desc, unit, qty, rate: col(/rate|price/), remarks: col(/remark|note|comment/) }
    }
  }
  return null
}

/**
 * Finds BOQ sheets (a header row with Description, Unit and Qty), then reads section rows
 * like "C. Masonry" and item rows that have a unit. One sheet becomes one part.
 */
export function parseBoqWorkbook(sheets: SheetRows[]): ParsedPart[] {
  const parts: ParsedPart[] = []
  for (const sheet of sheets) {
    const h = findHeader(sheet.rows)
    if (!h) continue
    const title = sheet.rows.slice(0, h.row).map((r) => text(r[0])).find((t) => /bill of quantities/i.test(t))
    const name = title?.split(/\s+-\s+/).slice(1).join(' - ') || sheet.name
    const part: ParsedPart = { code: '', name: titleCase(name), sheet: sheet.name, sections: [] }
    let section: ParsedSection | null = null

    for (let r = h.row + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r]
      const first = text(row[h.item >= 0 ? h.item : 0])
      const desc = text(row[h.desc])
      const unit = text(row[h.unit])
      if (/^summary\b/i.test(first) || /^summary\b/i.test(desc)) break
      // Merged cells repeat their text across the row, so a heading's "unit" equals its own text.
      const merged = unit === first || unit === desc
      const heading = first.match(/^([A-Z]{1,2}\d?)\.\s+(.+)$/)
      if (heading && (!unit || merged)) {
        section = { code: heading[1], title: heading[2], items: [] }
        part.sections.push(section)
        continue
      }
      if (!unit || !desc || merged || /^total\b/i.test(first) || /^total\b/i.test(desc)) continue
      if (!section) {
        section = { code: 'X', title: 'General', items: [] }
        part.sections.push(section)
      }
      const rate = h.rate >= 0 ? row[h.rate] : null
      section.items.push({
        code: first,
        description: desc,
        unit,
        quantity: numberText(row[h.qty]),
        rate: typeof rate === 'number' && rate !== 0 ? String(rate) : numberText(rate) === '0' ? '' : numberText(rate),
        remarks: h.remarks >= 0 ? text(row[h.remarks]) : ''
      })
      if (!part.code) part.code = first.match(/^([A-Za-z0-9]+)-/)?.[1] ?? ''
    }
    if (part.sections.some((s) => s.items.length)) parts.push(part)
  }
  return parts
}

function numberText(v: CellValue | undefined): string {
  if (typeof v === 'number') return String(v)
  const t = text(v).replace(/,/g, '')
  return t !== '' && !Number.isNaN(Number(t)) ? t : '0'
}

function titleCase(s: string): string {
  // "BASEMENT FLOOR" -> "Basement floor"; leave mixed case as typed.
  if (s !== s.toUpperCase()) return s
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export interface ImportResult {
  parts: number
  sections: number
  items: number
}

/** Adds the parsed parts to an estimate, keeping the BOQ's own item codes. */
export function importParts(db: Db, estimateId: number, parts: ParsedPart[]): ImportResult {
  const result = { parts: 0, sections: 0, items: 0 }
  db.transaction(() => {
    for (const p of parts) {
      const partId = addPart(db, estimateId, { code: p.code, name: p.name })
      result.parts++
      for (const s of p.sections) {
        const sectionId = addSection(db, partId, { code: s.code, title: s.title })
        result.sections++
        for (const it of s.items) {
          addItem(db, sectionId, it)
          result.items++
        }
      }
    }
  })
  return result
}

export async function importExcelFile(db: Db, estimateId: number, file: string): Promise<ImportResult> {
  const parts = parseBoqWorkbook(await readWorkbook(file))
  if (parts.length === 0) {
    throw new Error('No BOQ sheet found. A BOQ sheet needs a header row with Description, Unit and Qty columns.')
  }
  return importParts(db, estimateId, parts)
}
