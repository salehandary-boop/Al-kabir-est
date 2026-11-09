import Decimal from 'decimal.js'

// All money and quantity math goes through Decimal to avoid floating point errors.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type Num = string | number
export type ResourceType = 'material' | 'labor' | 'equipment' | 'subcontract'

/** One dimension-sheet row: count x L x W x H. Blank dimensions count as 1. */
export interface TakeoffLine {
  count?: Num | null
  length?: Num | null
  width?: Num | null
  height?: Num | null
  /** Set true for a deduction (for example an opening in a wall). */
  deduct?: boolean
}

export function takeoffLineResult(line: TakeoffLine): Decimal {
  const dims = [line.count, line.length, line.width, line.height]
  const value = dims.reduce<Decimal>(
    (acc, d) => (d === null || d === undefined || d === '' ? acc : acc.mul(d)),
    new Decimal(1)
  )
  return line.deduct ? value.neg() : value
}

export function takeoffQuantity(lines: TakeoffLine[]): Decimal {
  return lines.reduce((sum, l) => sum.add(takeoffLineResult(l)), new Decimal(0))
}

/** One resource in a unit rate recipe, for example 1.03 m3 ready-mix per m3 of slab. */
export interface BuildupLine {
  resourceType: ResourceType
  /** Resource quantity per one unit of the BOQ item. */
  consumption: Num
  /** Resource price in the estimate currency. */
  unitPrice: Num
  /** Waste allowance in percent, for example 5 for 5%. */
  wastePct?: Num
}

export interface RateBreakdown {
  material: Decimal
  labor: Decimal
  equipment: Decimal
  subcontract: Decimal
  total: Decimal
}

export function buildupLineCost(line: BuildupLine): Decimal {
  const waste = new Decimal(line.wastePct ?? 0).div(100).add(1)
  return new Decimal(line.consumption).mul(waste).mul(line.unitPrice)
}

export function unitRate(lines: BuildupLine[]): RateBreakdown {
  const r: RateBreakdown = {
    material: new Decimal(0),
    labor: new Decimal(0),
    equipment: new Decimal(0),
    subcontract: new Decimal(0),
    total: new Decimal(0)
  }
  for (const line of lines) {
    const cost = buildupLineCost(line)
    r[line.resourceType] = r[line.resourceType].add(cost)
    r.total = r.total.add(cost)
  }
  return r
}

export interface Markup {
  name: string
  /** Percent applied on the running subtotal, for example 10 for 10%. */
  percent: Num
}

export interface EstimateSummary {
  directCost: Decimal
  markups: { name: string; amount: Decimal }[]
  totalBeforeVat: Decimal
  vat: Decimal
  totalWithVat: Decimal
  /** Factor to spread markups into unit rates: priced rate = direct rate x factor. */
  markupFactor: Decimal
}

/**
 * Applies markups in order (site overheads, head office, risk, profit), each on the
 * running subtotal, then VAT on the result.
 */
export function summarize(directCost: Num, markups: Markup[], vatPct: Num): EstimateSummary {
  const direct = new Decimal(directCost)
  let running = direct
  const applied = markups.map((m) => {
    const amount = running.mul(m.percent).div(100)
    running = running.add(amount)
    return { name: m.name, amount }
  })
  const vat = running.mul(vatPct).div(100)
  return {
    directCost: direct,
    markups: applied,
    totalBeforeVat: running,
    vat,
    totalWithVat: running.add(vat),
    markupFactor: direct.isZero() ? new Decimal(1) : running.div(direct)
  }
}

/** Converts an amount using a rate expressed as target units per one source unit. */
export function convert(amount: Num, rate: Num): Decimal {
  return new Decimal(amount).mul(rate)
}

export function money(value: Decimal, decimals = 2): string {
  return value.toDecimalPlaces(decimals).toFixed(decimals)
}
