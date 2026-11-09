import ExcelJS from 'exceljs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import { getBoq, latestEstimateId } from '../src/main/db/boq'
import { createProject, listCountries } from '../src/main/db/repo'
import { importExcelFile, parseBoqWorkbook, readWorkbook } from '../src/main/importExcel'

/** Builds a small workbook laid out like a per-floor tender BOQ. */
async function sampleWorkbook(): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('General Notes').addRow(['Notes only'])
  const ws = wb.addWorksheet('Basement')
  ws.addRow(['SAMPLE BUILDING'])
  ws.addRow(['BILL OF QUANTITIES - BASEMENT FLOOR'])
  ws.addRow([])
  ws.addRow([])
  ws.addRow(['Item', 'Description', 'Unit', 'Qty', 'Unit rate (USD)', 'Amount (USD)', 'Remarks'])
  ws.addRow(['C. Masonry'])
  ws.mergeCells('A6:G6') // section headings are merged across the row
  ws.addRow(['B-C.1', 'Hollow concrete block 15 cm', 'm2', 267.9, 0, { formula: 'D7*E7', result: 0 }])
  ws.addRow(['B-C.2', 'RC lintels and stiffeners', 'nr', { formula: '10+3', result: 13 }, 45, null, 'per drawings'])
  ws.addRow([null, 'Total C. Masonry', null, null, null, { formula: 'SUM(F7:F8)', result: 0 }])
  ws.addRow([])
  ws.addRow(['J. Plumbing'])
  ws.mergeCells('A11:G11')
  ws.addRow(['B-J.1', 'Transfer pumps', 'nr', 2, 0])
  ws.addRow(['SUMMARY - BASEMENT FLOOR'])
  ws.addRow(['C. Masonry', null, null, null, null, 100])
  const file = join(mkdtempSync(join(tmpdir(), 'akest-')), 'boq.xlsx')
  await wb.xlsx.writeFile(file)
  return file
}

describe('Excel import', () => {
  it('reads parts, trade sections and items, skipping totals and the summary', async () => {
    const parts = parseBoqWorkbook(await readWorkbook(await sampleWorkbook()))
    expect(parts).toHaveLength(1)
    const [p] = parts
    expect(p.code).toBe('B')
    expect(p.name).toBe('Basement floor')
    expect(p.sections.map((s) => `${s.code} ${s.title} ${s.items.length}`)).toEqual(['C Masonry 2', 'J Plumbing 1'])
    expect(p.sections[0].items[1]).toEqual({
      code: 'B-C.2',
      description: 'RC lintels and stiffeners',
      unit: 'nr',
      quantity: '13',
      rate: '45',
      remarks: 'per drawings'
    })
    expect(p.sections[0].items[0].rate).toBe('') // zero rate = not priced yet
  })

  it('imports into an estimate and keeps the BOQ item codes', async () => {
    const db = await openDatabase(':memory:')
    const estimateId = latestEstimateId(db, createProject(db, { name: 'Test', countryId: listCountries(db)[0].id }))
    const r = await importExcelFile(db, estimateId, await sampleWorkbook())
    expect(r).toEqual({ parts: 1, sections: 2, items: 3 })
    const boq = getBoq(db, estimateId)
    expect(boq.parts[0].sections[0].items.map((i) => i.code)).toEqual(['B-C.1', 'B-C.2'])
    expect(boq.parts[0].total).toBe('585.00') // 13 x 45
  })
})
