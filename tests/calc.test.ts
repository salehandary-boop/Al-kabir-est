import { describe, expect, it } from 'vitest'
import { money, summarize, takeoffQuantity, unitRate, convert } from '../src/shared/calc'

describe('takeoff', () => {
  it('sums count x L x W x H and subtracts deductions', () => {
    const qty = takeoffQuantity([
      { count: 4, length: 2, width: 2, height: 0.6 }, // 4 footings = 9.6 m3
      { count: 1, length: 1, width: 1, height: 0.6, deduct: true } // -0.6
    ])
    expect(qty.toString()).toBe('9')
  })
  it('treats blank dimensions as 1', () => {
    expect(takeoffQuantity([{ length: 12.5 }]).toString()).toBe('12.5')
  })
})

describe('unit rate buildup', () => {
  it('prices 1 m3 of slab concrete from resources with waste', () => {
    const r = unitRate([
      { resourceType: 'material', consumption: 1, unitPrice: 95, wastePct: 3 }, // ready-mix
      { resourceType: 'equipment', consumption: 1, unitPrice: 8 }, // pump share
      { resourceType: 'labor', consumption: 0.5, unitPrice: 12 } // crew hours
    ])
    expect(money(r.material)).toBe('97.85')
    expect(money(r.equipment)).toBe('8.00')
    expect(money(r.labor)).toBe('6.00')
    expect(money(r.total)).toBe('111.85')
  })
  it('has no floating point drift', () => {
    const r = unitRate([{ resourceType: 'material', consumption: '0.1', unitPrice: '0.2' }])
    expect(r.total.toString()).toBe('0.02')
  })
})

describe('estimate summary', () => {
  it('applies markups in order then VAT', () => {
    const s = summarize(100000, [
      { name: 'Site overheads', percent: 8 },
      { name: 'Head office', percent: 5 },
      { name: 'Profit', percent: 10 }
    ], 11)
    expect(money(s.totalBeforeVat)).toBe('124740.00') // 100000 x 1.08 x 1.05 x 1.10
    expect(money(s.vat)).toBe('13721.40')
    expect(money(s.totalWithVat)).toBe('138461.40')
    expect(s.markupFactor.toString()).toBe('1.2474')
  })
  it('converts currency', () => {
    expect(money(convert(100, 89500), 0)).toBe('8950000')
  })
})
