import type Database from 'better-sqlite3'

export interface CountryRow {
  id: number
  code: string
  name: string
  base_currency: string
  local_currency: string | null
  vat_pct: string
  default_standard: string
}

export interface ProjectRow {
  id: number
  name: string
  client: string | null
  country_name: string
  city_name: string | null
  currency: string
  standard: string
  created_at: string
}

export interface NewProject {
  name: string
  client?: string
  countryId: number
  cityId?: number
}

export function listCountries(db: Database.Database): CountryRow[] {
  return db.prepare('SELECT * FROM country_profile ORDER BY name').all() as CountryRow[]
}

export function listCities(db: Database.Database, countryId: number) {
  return db.prepare('SELECT id, name FROM city WHERE country_id = ? ORDER BY name').all(countryId) as {
    id: number
    name: string
  }[]
}

export function listProjects(db: Database.Database): ProjectRow[] {
  return db
    .prepare(
      `SELECT p.id, p.name, p.client, c.name AS country_name, ci.name AS city_name,
              p.currency, p.standard, p.created_at
       FROM project p
       JOIN country_profile c ON c.id = p.country_id
       LEFT JOIN city ci ON ci.id = p.city_id
       ORDER BY p.created_at DESC, p.id DESC`
    )
    .all() as ProjectRow[]
}

/** Creates a project from its country profile, with revision 0 and default markups. */
export function createProject(db: Database.Database, input: NewProject): number {
  const country = db.prepare('SELECT * FROM country_profile WHERE id = ?').get(input.countryId) as
    | CountryRow
    | undefined
  if (!country) throw new Error(`Unknown country ${input.countryId}`)
  const library = db
    .prepare("SELECT id FROM library WHERE country_id = ? AND kind = 'master' LIMIT 1")
    .get(country.id) as { id: number } | undefined

  return db.transaction(() => {
    const projectId = Number(
      db
        .prepare(
          `INSERT INTO project (name, client, country_id, city_id, currency, vat_pct, standard, library_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name,
          input.client ?? null,
          country.id,
          input.cityId ?? null,
          country.base_currency,
          country.vat_pct,
          country.default_standard,
          library?.id ?? null
        ).lastInsertRowid
    )
    const estimateId = db
      .prepare('INSERT INTO estimate (project_id, revision) VALUES (?, 0)')
      .run(projectId).lastInsertRowid
    const addMarkup = db.prepare(
      'INSERT INTO markup (estimate_id, type, name, percent, sort_order) VALUES (?, ?, ?, ?, ?)'
    )
    addMarkup.run(estimateId, 'site_overhead', 'Site overheads', '0', 1)
    addMarkup.run(estimateId, 'head_office', 'Head office overheads', '0', 2)
    addMarkup.run(estimateId, 'risk', 'Contingency', '0', 3)
    addMarkup.run(estimateId, 'profit', 'Profit', '0', 4)
    return projectId
  })()
}
