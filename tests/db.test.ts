import { describe, expect, it } from 'vitest'
import { migrations } from '../src/main/db/schema'
import { openDatabase } from '../src/main/db'
import { createProject, listCities, listCountries, listProjects } from '../src/main/db/repo'

describe('database', () => {
  it('creates the schema and seeds Lebanon', async () => {
    const db = await openDatabase(':memory:')
    const countries = listCountries(db)
    expect(countries.map((c) => c.code)).toEqual(['LB'])
    expect(countries[0].base_currency).toBe('USD')
    expect(listCities(db, countries[0].id).length).toBeGreaterThan(0)
  })

  it('creates a project that inherits its country profile', async () => {
    const db = await openDatabase(':memory:')
    const lb = listCountries(db)[0]
    const beirut = listCities(db, lb.id).find((c) => c.name === 'Beirut')!
    createProject(db, { name: 'Residential building, Achrafieh', countryId: lb.id, cityId: beirut.id })
    const [p] = listProjects(db)
    expect(p.country_name).toBe('Lebanon')
    expect(p.city_name).toBe('Beirut')
    expect(p.currency).toBe('USD')
    const markups = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM markup')!
    expect(markups.n).toBe(4)
  })

  it('records the schema version', async () => {
    const db = await openDatabase(':memory:')
    expect(db.userVersion()).toBe(migrations.length)
  })
})

describe('database file', () => {
  it('saves to disk and reopens with the same data', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const file = join(mkdtempSync(join(tmpdir(), 'akest-')), 'company.sqlite')
    const db = await openDatabase(file)
    createProject(db, { name: 'Villa, Jounieh', countryId: listCountries(db)[0].id })
    db.close()
    const again = await openDatabase(file)
    expect(listProjects(again).map((p) => p.name)).toEqual(['Villa, Jounieh'])
    expect(listCountries(again)).toHaveLength(1)
  })
})

describe('upgrading a version 0.1 database', () => {
  it('adds parts and keeps existing projects and sections', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { openSqlite } = await import('../src/main/db/sqlite')
    const { seedCountries } = await import('../src/main/db/seed')
    const file = join(mkdtempSync(join(tmpdir(), 'akest-')), 'company.sqlite')
    // Build a file the way version 0.1 did: only the first migration.
    const old = await openSqlite(file)
    old.exec(migrations[0])
    old.exec('PRAGMA user_version = 1')
    seedCountries(old)
    const pid = createProject(old, { name: 'TEST 1', client: 'Draft1', countryId: listCountries(old)[0].id })
    const eid = old.get<{ id: number }>('SELECT id FROM estimate WHERE project_id = ?', [pid])!.id
    old.run("INSERT INTO boq_section (estimate_id, code, title) VALUES (?, 'A', 'Old section')", [eid])
    old.close()

    const db = await openDatabase(file)
    expect(db.userVersion()).toBe(migrations.length)
    expect(listProjects(db).map((p) => p.name)).toEqual(['TEST 1'])
    const { getBoq } = await import('../src/main/db/boq')
    const boq = getBoq(db, eid)
    expect(boq.parts.map((p) => p.name)).toEqual(['Main'])
    expect(boq.parts[0].sections[0].title).toBe('Old section')
  })
})
