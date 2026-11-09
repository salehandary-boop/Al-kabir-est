import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import { createProject, listCountries } from '../src/main/db/repo'
import {
  addItem,
  addPart,
  addSection,
  addTakeoff,
  deleteTakeoff,
  getBoq,
  latestEstimateId,
  listTakeoff,
  setExchangeRate,
  updateItem,
  updateMarkup,
  updateTakeoff
} from '../src/main/db/boq'

async function setup() {
  const db = await openDatabase(':memory:')
  const projectId = createProject(db, { name: 'Villa', countryId: listCountries(db)[0].id })
  const estimateId = latestEstimateId(db, projectId)
  return { db, estimateId }
}

describe('BOQ', () => {
  it('codes items by part, trade letter and number, and sums totals', async () => {
    const { db, estimateId } = await setup()
    const basement = addPart(db, estimateId, { code: 'B', name: 'Basement floor' })
    const masonry = addSection(db, basement, { code: 'C' })
    const a = addItem(db, masonry, { description: 'Hollow block 15 cm', unit: 'm2' })
    updateItem(db, a, { quantity: '267.9', rate: '20' })
    const b = addItem(db, masonry, { description: 'RC lintels', unit: 'nr' })
    updateItem(db, b, { quantity: '1,000', rate: '85.25', remarks: 'incl. stiffeners' })
    const gf = addPart(db, estimateId, { code: 'G', name: 'Ground floor' })
    const plaster = addSection(db, gf) // first free trade: A
    addItem(db, plaster, { quantity: '10', rate: '5' })

    const boq = getBoq(db, estimateId)
    const [bp, gp] = boq.parts
    expect(bp.sections[0].title).toBe('Masonry')
    expect(bp.sections[0].items.map((i) => i.code)).toEqual(['B-C.1', 'B-C.2'])
    expect(bp.sections[0].items[0].amount).toBe('5358.00')
    expect(bp.sections[0].items[1].remarks).toBe('incl. stiffeners')
    expect(bp.total).toBe('90608.00')
    expect(gp.sections[0].code).toBe('A')
    expect(gp.sections[0].items[0].code).toBe('G-A.1')
    expect(boq.summary.directCost).toBe('90658.00')
  })

  it('takes the quantity from the dimension sheet, with deductions', async () => {
    const { db, estimateId } = await setup()
    const item = addItem(db, addSection(db, addPart(db, estimateId, {})), { unit: 'm2' })
    const wall = addTakeoff(db, item)
    updateTakeoff(db, wall, { count: '2', length: '10', height: '3' }) // 60 m2
    const door = addTakeoff(db, item)
    updateTakeoff(db, door, { count: '2', width: '0.9', height: '2.1', deduct: true }) // -3.78
    expect(listTakeoff(db, item).total).toBe('56.22')
    const view = () => getBoq(db, estimateId).parts[0].sections[0].items[0]
    expect(view().quantity).toBe('56.22')
    expect(view().fromTakeoff).toBe(true)

    deleteTakeoff(db, door)
    expect(view().quantity).toBe('60')

    // Typing a quantity switches to manual.
    updateItem(db, item, { quantity: '75' })
    expect(view().quantity).toBe('75')
    expect(view().fromTakeoff).toBe(false)
  })

  it('applies markups, VAT and the LBP total', async () => {
    const { db, estimateId } = await setup()
    const item = addItem(db, addSection(db, addPart(db, estimateId, {})))
    updateItem(db, item, { quantity: '1', rate: '100000' })
    const [site, office, , profit] = getBoq(db, estimateId).summary.markups
    updateMarkup(db, site.id, '8')
    updateMarkup(db, office.id, '5')
    updateMarkup(db, profit.id, '10')
    setExchangeRate(db, estimateId, '89,500')
    const s = getBoq(db, estimateId).summary
    expect(s.totalBeforeVat).toBe('124740.00')
    expect(s.vat).toBe('13721.40')
    expect(s.totalWithVat).toBe('138461.40')
    expect(s.totalLocal).toBe('12392295300')
  })

  it('rejects text where a number is expected', async () => {
    const { db, estimateId } = await setup()
    const item = addItem(db, addSection(db, addPart(db, estimateId, {})))
    expect(() => updateItem(db, item, { rate: 'abc' })).toThrow(/Rate must be a number/)
  })

  it('refuses changes to a locked estimate', async () => {
    const { db, estimateId } = await setup()
    db.run("UPDATE estimate SET status = 'locked' WHERE id = ?", [estimateId])
    expect(() => addPart(db, estimateId, {})).toThrow(/locked/)
  })
})
