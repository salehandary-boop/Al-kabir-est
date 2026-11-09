import Decimal from 'decimal.js'
import { money, summarize, takeoffLineResult, takeoffQuantity } from '../../shared/calc'
import type { Db } from './sqlite'

/** Accepts user-typed numbers ("1,250.5", " 3 ") and returns a clean decimal string. */
export function cleanNumber(value: unknown, field = 'value'): string {
  const text = String(value ?? '').replace(/,/g, '').trim()
  if (text === '') return '0'
  try {
    const d = new Decimal(text)
    if (!d.isFinite()) throw new Error()
    return d.toString()
  } catch {
    throw new Error(`${field} must be a number, got "${value}"`)
  }
}

function optionalNumber(value: unknown, field: string): string | null {
  const text = String(value ?? '').trim()
  return text === '' ? null : cleanNumber(text, field)
}

/** Standard trade sections, lettered the same in every part (as in the Al Foad 2 BOQ). */
export const TRADES: { code: string; title: string }[] = [
  { code: 'A', title: 'Site works and earthworks' },
  { code: 'B', title: 'Concrete works' },
  { code: 'C', title: 'Masonry' },
  { code: 'D', title: 'Waterproofing' },
  { code: 'E', title: 'Plaster and paint' },
  { code: 'F', title: 'Facade and external finishes' },
  { code: 'G', title: 'Flooring and tiling' },
  { code: 'H', title: 'Doors, windows and metalwork' },
  { code: 'I', title: 'Joinery' },
  { code: 'J', title: 'Plumbing' },
  { code: 'K', title: 'Electrical' },
  { code: 'L', title: 'Ventilation and AC drainage' },
  { code: 'M', title: 'Lift' },
  { code: 'N', title: 'External works' }
]

// ---------- Read model sent to the screen ----------

export interface TakeoffView {
  id: number
  description: string
  drawingRef: string
  count: string
  length: string
  width: string
  height: string
  deduct: boolean
  result: string
}

export interface ItemView {
  id: number
  sectionId: number
  code: string
  description: string
  unit: string
  quantity: string
  fromTakeoff: boolean
  takeoffCount: number
  rate: string
  amount: string
  remarks: string
}

export interface SectionView {
  id: number
  code: string
  title: string
  total: string
  items: ItemView[]
}

export interface PartView {
  id: number
  code: string
  name: string
  total: string
  sections: SectionView[]
}

export interface MarkupView {
  id: number
  name: string
  percent: string
  amount: string
}

export interface BoqView {
  project: { id: number; name: string; client: string | null; location: string; currency: string; standard: string }
  estimate: { id: number; revision: number; status: string; exchangeRate: string; localCurrency: string | null }
  parts: PartView[]
  summary: {
    directCost: string
    markups: MarkupView[]
    totalBeforeVat: string
    vatPct: string
    vat: string
    totalWithVat: string
    totalLocal: string | null
  }
}

interface EstimateRow {
  id: number
  revision: number
  status: string
  exchange_rate: string | null
  project_id: number
  name: string
  client: string | null
  currency: string
  vat_pct: string
  standard: string
  country_name: string
  local_currency: string | null
  city_name: string | null
}

export function latestEstimateId(db: Db, projectId: number): number {
  const row = db.get<{ id: number }>(
    'SELECT id FROM estimate WHERE project_id = ? ORDER BY revision DESC LIMIT 1',
    [projectId]
  )
  if (!row) throw new Error(`Project ${projectId} has no estimate`)
  return row.id
}

export function getBoq(db: Db, estimateId: number): BoqView {
  const e = db.get<EstimateRow>(
    `SELECT e.id, e.revision, e.status, e.exchange_rate, p.id AS project_id, p.name, p.client,
            p.currency, p.vat_pct, p.standard, c.name AS country_name, c.local_currency, ci.name AS city_name
     FROM estimate e
     JOIN project p ON p.id = e.project_id
     JOIN country_profile c ON c.id = p.country_id
     LEFT JOIN city ci ON ci.id = p.city_id
     WHERE e.id = ?`,
    [estimateId]
  )
  if (!e) throw new Error(`Estimate ${estimateId} not found`)

  const partRows = db.all<{ id: number; code: string; name: string }>(
    'SELECT id, code, name FROM boq_part WHERE estimate_id = ? ORDER BY sort_order, id',
    [estimateId]
  )
  const sectionRows = db.all<{ id: number; part_id: number; code: string; title: string }>(
    'SELECT id, part_id, code, title FROM boq_section WHERE estimate_id = ? ORDER BY code, sort_order, id',
    [estimateId]
  )
  const itemRows = db.all<{
    id: number
    section_id: number
    code: string
    description: string
    unit: string
    quantity: string
    quantity_from_takeoff: number
    fixed_rate: string | null
    remarks: string | null
    takeoff_count: number
  }>(
    `SELECT i.id, i.section_id, i.code, i.description, i.unit, i.quantity, i.quantity_from_takeoff,
            i.fixed_rate, i.remarks, (SELECT COUNT(*) FROM takeoff_line t WHERE t.boq_item_id = i.id) AS takeoff_count
     FROM boq_item i JOIN boq_section s ON s.id = i.section_id
     WHERE s.estimate_id = ?
     ORDER BY i.sort_order, i.id`,
    [estimateId]
  )

  let direct = new Decimal(0)
  const parts: PartView[] = partRows.map((p) => {
    let partTotal = new Decimal(0)
    const sections = sectionRows
      .filter((s) => s.part_id === p.id)
      .map((s) => {
        let sectionTotal = new Decimal(0)
        const items = itemRows
          .filter((i) => i.section_id === s.id)
          .map((i) => {
            const rate = new Decimal(i.fixed_rate ?? 0)
            const amount = new Decimal(i.quantity).mul(rate)
            sectionTotal = sectionTotal.add(amount)
            return {
              id: i.id,
              sectionId: s.id,
              code: i.code,
              description: i.description,
              unit: i.unit,
              quantity: new Decimal(i.quantity).toDecimalPlaces(3).toString(),
              fromTakeoff: i.quantity_from_takeoff === 1 && i.takeoff_count > 0,
              takeoffCount: i.takeoff_count,
              rate: i.fixed_rate ?? '',
              amount: money(amount),
              remarks: i.remarks ?? ''
            }
          })
        partTotal = partTotal.add(sectionTotal)
        return { id: s.id, code: s.code, title: s.title, total: money(sectionTotal), items }
      })
    direct = direct.add(partTotal)
    return { id: p.id, code: p.code, name: p.name, total: money(partTotal), sections }
  })

  const markupRows = db.all<{ id: number; name: string; percent: string }>(
    'SELECT id, name, percent FROM markup WHERE estimate_id = ? ORDER BY sort_order, id',
    [estimateId]
  )
  const s = summarize(direct.toString(), markupRows.map((m) => ({ name: m.name, percent: m.percent })), e.vat_pct)
  const rate = e.exchange_rate ? new Decimal(e.exchange_rate) : null

  return {
    project: {
      id: e.project_id,
      name: e.name,
      client: e.client,
      location: [e.city_name, e.country_name].filter(Boolean).join(', '),
      currency: e.currency,
      standard: e.standard
    },
    estimate: {
      id: e.id,
      revision: e.revision,
      status: e.status,
      exchangeRate: e.exchange_rate ?? '',
      localCurrency: e.local_currency
    },
    parts,
    summary: {
      directCost: money(s.directCost),
      markups: markupRows.map((m, idx) => ({
        id: m.id,
        name: m.name,
        percent: m.percent,
        amount: money(s.markups[idx].amount)
      })),
      totalBeforeVat: money(s.totalBeforeVat),
      vatPct: e.vat_pct,
      vat: money(s.vat),
      totalWithVat: money(s.totalWithVat),
      totalLocal: rate && !rate.isZero() ? money(s.totalWithVat.mul(rate), 0) : null
    }
  }
}

// ---------- Changes ----------

function assertEditable(db: Db, estimateId: number): void {
  const e = db.get<{ status: string }>('SELECT status FROM estimate WHERE id = ?', [estimateId])
  if (!e) throw new Error(`Estimate ${estimateId} not found`)
  if (e.status === 'locked') throw new Error('This estimate is locked and cannot be changed')
}

function estimateOfPart(db: Db, partId: number): number {
  const r = db.get<{ estimate_id: number }>('SELECT estimate_id FROM boq_part WHERE id = ?', [partId])
  if (!r) throw new Error(`Part ${partId} not found`)
  return r.estimate_id
}

function estimateOfSection(db: Db, sectionId: number): number {
  const r = db.get<{ estimate_id: number }>('SELECT estimate_id FROM boq_section WHERE id = ?', [sectionId])
  if (!r) throw new Error(`Section ${sectionId} not found`)
  return r.estimate_id
}

function sectionOfItem(db: Db, itemId: number): number {
  const r = db.get<{ section_id: number }>('SELECT section_id FROM boq_item WHERE id = ?', [itemId])
  if (!r) throw new Error(`Item ${itemId} not found`)
  return r.section_id
}

function itemOfTakeoff(db: Db, lineId: number): number {
  const r = db.get<{ boq_item_id: number }>('SELECT boq_item_id FROM takeoff_line WHERE id = ?', [lineId])
  if (!r) throw new Error(`Takeoff line ${lineId} not found`)
  return r.boq_item_id
}

export function addPart(db: Db, estimateId: number, input: { code?: string; name?: string }): number {
  assertEditable(db, estimateId)
  const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM boq_part WHERE estimate_id = ?', [estimateId])!.n
  return db.run('INSERT INTO boq_part (estimate_id, code, name, sort_order) VALUES (?, ?, ?, ?)', [
    estimateId,
    input.code?.trim() ?? '',
    input.name?.trim() || `Part ${n + 1}`,
    n + 1
  ])
}

export function updatePart(db: Db, partId: number, input: { code?: string; name?: string }): void {
  assertEditable(db, estimateOfPart(db, partId))
  if (input.code !== undefined) db.run('UPDATE boq_part SET code = ? WHERE id = ?', [input.code.trim(), partId])
  if (input.name !== undefined) db.run('UPDATE boq_part SET name = ? WHERE id = ?', [input.name.trim(), partId])
}

export function deletePart(db: Db, partId: number): void {
  assertEditable(db, estimateOfPart(db, partId))
  db.run('DELETE FROM boq_part WHERE id = ?', [partId])
}

/** Adds a trade section to a part. With no code, picks the first standard trade not used yet. */
export function addSection(db: Db, partId: number, input: { code?: string; title?: string } = {}): number {
  const estimateId = estimateOfPart(db, partId)
  assertEditable(db, estimateId)
  const used = new Set(
    db.all<{ code: string }>('SELECT code FROM boq_section WHERE part_id = ?', [partId]).map((r) => r.code)
  )
  let code = input.code?.trim()
  let title = input.title?.trim()
  if (!code) {
    const trade = TRADES.find((t) => !used.has(t.code))
    code = trade?.code ?? `X${used.size + 1}`
    title = title || trade?.title
  } else if (!title) {
    title = TRADES.find((t) => t.code === code)?.title
  }
  return db.run('INSERT INTO boq_section (estimate_id, part_id, code, title, sort_order) VALUES (?, ?, ?, ?, ?)', [
    estimateId,
    partId,
    code,
    title || 'New section',
    used.size + 1
  ])
}

export function updateSection(db: Db, sectionId: number, input: { code?: string; title?: string }): void {
  assertEditable(db, estimateOfSection(db, sectionId))
  if (input.code !== undefined) db.run('UPDATE boq_section SET code = ? WHERE id = ?', [input.code.trim(), sectionId])
  if (input.title !== undefined) db.run('UPDATE boq_section SET title = ? WHERE id = ?', [input.title.trim(), sectionId])
}

export function deleteSection(db: Db, sectionId: number): void {
  assertEditable(db, estimateOfSection(db, sectionId))
  db.run('DELETE FROM boq_section WHERE id = ?', [sectionId])
}

/** New item coded like the Al Foad 2 BOQ: part prefix, trade letter, number (B-C.3). */
export function addItem(
  db: Db,
  sectionId: number,
  input: { code?: string; description?: string; unit?: string; quantity?: string; rate?: string; remarks?: string } = {}
): number {
  assertEditable(db, estimateOfSection(db, sectionId))
  const s = db.get<{ code: string; part_code: string | null }>(
    'SELECT s.code, p.code AS part_code FROM boq_section s LEFT JOIN boq_part p ON p.id = s.part_id WHERE s.id = ?',
    [sectionId]
  )!
  const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM boq_item WHERE section_id = ?', [sectionId])!.n
  const prefix = s.part_code ? `${s.part_code}-` : ''
  return db.run(
    `INSERT INTO boq_item (section_id, code, description, unit, quantity, fixed_rate, remarks, rate_mode, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'lump_sum', ?)`,
    [
      sectionId,
      input.code?.trim() || `${prefix}${s.code}.${n + 1}`,
      input.description?.trim() || '',
      input.unit?.trim() || 'm2',
      cleanNumber(input.quantity ?? '0', 'Quantity'),
      optionalNumber(input.rate, 'Rate'),
      input.remarks?.trim() || null,
      n + 1
    ]
  )
}

export interface ItemChanges {
  code?: string
  description?: string
  unit?: string
  quantity?: string
  rate?: string
  remarks?: string
}

export function updateItem(db: Db, itemId: number, changes: ItemChanges): void {
  assertEditable(db, estimateOfSection(db, sectionOfItem(db, itemId)))
  db.transaction(() => {
    if (changes.code !== undefined) db.run('UPDATE boq_item SET code = ? WHERE id = ?', [changes.code.trim(), itemId])
    if (changes.description !== undefined)
      db.run('UPDATE boq_item SET description = ? WHERE id = ?', [changes.description, itemId])
    if (changes.unit !== undefined) db.run('UPDATE boq_item SET unit = ? WHERE id = ?', [changes.unit.trim(), itemId])
    if (changes.remarks !== undefined)
      db.run('UPDATE boq_item SET remarks = ? WHERE id = ?', [changes.remarks.trim() || null, itemId])
    if (changes.rate !== undefined)
      db.run('UPDATE boq_item SET fixed_rate = ? WHERE id = ?', [optionalNumber(changes.rate, 'Rate'), itemId])
    if (changes.quantity !== undefined) {
      // Typing a quantity switches the item to a manual quantity.
      db.run('UPDATE boq_item SET quantity = ?, quantity_from_takeoff = 0 WHERE id = ?', [
        cleanNumber(changes.quantity, 'Quantity'),
        itemId
      ])
    }
  })
}

export function deleteItem(db: Db, itemId: number): void {
  assertEditable(db, estimateOfSection(db, sectionOfItem(db, itemId)))
  db.run('DELETE FROM boq_item WHERE id = ?', [itemId])
}

// ---------- Dimension sheet ----------

interface TakeoffRow {
  id: number
  description: string | null
  drawing_ref: string | null
  count: string | null
  length: string | null
  width: string | null
  height: string | null
  deduct: number
}

function takeoffRows(db: Db, itemId: number): TakeoffRow[] {
  return db.all<TakeoffRow>('SELECT * FROM takeoff_line WHERE boq_item_id = ? ORDER BY sort_order, id', [itemId])
}

function toCalc(r: TakeoffRow) {
  return { count: r.count, length: r.length, width: r.width, height: r.height, deduct: r.deduct === 1 }
}

export function listTakeoff(db: Db, itemId: number): { lines: TakeoffView[]; total: string } {
  const rows = takeoffRows(db, itemId)
  return {
    lines: rows.map((r) => ({
      id: r.id,
      description: r.description ?? '',
      drawingRef: r.drawing_ref ?? '',
      count: r.count ?? '',
      length: r.length ?? '',
      width: r.width ?? '',
      height: r.height ?? '',
      deduct: r.deduct === 1,
      result: takeoffLineResult(toCalc(r)).toDecimalPlaces(3).toString()
    })),
    total: takeoffQuantity(rows.map(toCalc)).toDecimalPlaces(3).toString()
  }
}

/** Sets the item quantity to the sum of its dimension sheet. */
function syncQuantity(db: Db, itemId: number): void {
  const total = takeoffQuantity(takeoffRows(db, itemId).map(toCalc))
  db.run('UPDATE boq_item SET quantity = ?, quantity_from_takeoff = 1 WHERE id = ?', [total.toString(), itemId])
}

export function addTakeoff(db: Db, itemId: number): number {
  assertEditable(db, estimateOfSection(db, sectionOfItem(db, itemId)))
  return db.transaction(() => {
    const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM takeoff_line WHERE boq_item_id = ?', [itemId])!.n
    const id = db.run("INSERT INTO takeoff_line (boq_item_id, count, sort_order) VALUES (?, '1', ?)", [itemId, n + 1])
    syncQuantity(db, itemId)
    return id
  })
}

export interface TakeoffChanges {
  description?: string
  drawingRef?: string
  count?: string
  length?: string
  width?: string
  height?: string
  deduct?: boolean
}

export function updateTakeoff(db: Db, lineId: number, c: TakeoffChanges): void {
  const itemId = itemOfTakeoff(db, lineId)
  assertEditable(db, estimateOfSection(db, sectionOfItem(db, itemId)))
  db.transaction(() => {
    if (c.description !== undefined) db.run('UPDATE takeoff_line SET description = ? WHERE id = ?', [c.description, lineId])
    if (c.drawingRef !== undefined) db.run('UPDATE takeoff_line SET drawing_ref = ? WHERE id = ?', [c.drawingRef, lineId])
    for (const [key, col, label] of [
      ['count', 'count', 'Count'],
      ['length', 'length', 'Length'],
      ['width', 'width', 'Width'],
      ['height', 'height', 'Height']
    ] as const) {
      if (c[key] !== undefined) db.run(`UPDATE takeoff_line SET ${col} = ? WHERE id = ?`, [optionalNumber(c[key], label), lineId])
    }
    if (c.deduct !== undefined) db.run('UPDATE takeoff_line SET deduct = ? WHERE id = ?', [c.deduct ? 1 : 0, lineId])
    syncQuantity(db, itemId)
  })
}

export function deleteTakeoff(db: Db, lineId: number): void {
  const itemId = itemOfTakeoff(db, lineId)
  assertEditable(db, estimateOfSection(db, sectionOfItem(db, itemId)))
  db.transaction(() => {
    db.run('DELETE FROM takeoff_line WHERE id = ?', [lineId])
    const left = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM takeoff_line WHERE boq_item_id = ?', [itemId])!.n
    if (left > 0) syncQuantity(db, itemId)
    else db.run('UPDATE boq_item SET quantity_from_takeoff = 0 WHERE id = ?', [itemId])
  })
}

// ---------- Markups and currency ----------

export function updateMarkup(db: Db, markupId: number, percent: string): void {
  const r = db.get<{ estimate_id: number }>('SELECT estimate_id FROM markup WHERE id = ?', [markupId])
  if (!r) throw new Error(`Markup ${markupId} not found`)
  assertEditable(db, r.estimate_id)
  db.run('UPDATE markup SET percent = ? WHERE id = ?', [cleanNumber(percent, 'Percent'), markupId])
}

export function setExchangeRate(db: Db, estimateId: number, rate: string): void {
  assertEditable(db, estimateId)
  db.run("UPDATE estimate SET exchange_rate = ?, exchange_rate_date = date('now') WHERE id = ?", [
    optionalNumber(rate, 'Exchange rate'),
    estimateId
  ])
}
