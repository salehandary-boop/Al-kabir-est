import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db'
import { createProject, listCities, listCountries, listProjects } from '../src/main/db/repo'

describe('database', () => {
  it('creates the schema and seeds Lebanon', () => {
    const db = openDatabase(':memory:')
    const countries = listCountries(db)
    expect(countries.map((c) => c.code)).toEqual(['LB'])
    expect(countries[0].base_currency).toBe('USD')
    expect(listCities(db, countries[0].id).length).toBeGreaterThan(0)
  })

  it('creates a project that inherits its country profile', () => {
    const db = openDatabase(':memory:')
    const lb = listCountries(db)[0]
    const beirut = listCities(db, lb.id).find((c) => c.name === 'Beirut')!
    createProject(db, { name: 'Residential building, Achrafieh', countryId: lb.id, cityId: beirut.id })
    const [p] = listProjects(db)
    expect(p.country_name).toBe('Lebanon')
    expect(p.city_name).toBe('Beirut')
    expect(p.currency).toBe('USD')
    const markups = db.prepare('SELECT COUNT(*) AS n FROM markup').get() as { n: number }
    expect(markups.n).toBe(4)
  })

  it('migrations are idempotent', () => {
    const db = openDatabase(':memory:')
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })
})
