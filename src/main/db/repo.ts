import type { Db } from './sqlite'

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

export function listCountries(db: Db): CountryRow[] {
  return db.all<CountryRow>('SELECT * FROM country_profile ORDER BY name')
}

export function listCities(db: Db, countryId: number) {
  return db.all<{ id: number; name: string }>(
    'SELECT id, name FROM city WHERE country_id = ? ORDER BY name',
    [countryId]
  )
}

export function listProjects(db: Db): ProjectRow[] {
  return db.all<ProjectRow>(
    `SELECT p.id, p.name, p.client, c.name AS country_name, ci.name AS city_name,
              p.currency, p.standard, p.created_at
       FROM project p
       JOIN country_profile c ON c.id = p.country_id
       LEFT JOIN city ci ON ci.id = p.city_id
       ORDER BY p.created_at DESC, p.id DESC`
  )
}

/** Creates a project from its country profile, with revision 0 and default markups. */
export function createProject(db: Db, input: NewProject): number {
  const country = db.get<CountryRow>('SELECT * FROM country_profile WHERE id = ?', [input.countryId])
  if (!country) throw new Error(`Unknown country ${input.countryId}`)
  const library = db.get<{ id: number }>(
    "SELECT id FROM library WHERE country_id = ? AND kind = 'master' LIMIT 1",
    [country.id]
  )

  return db.transaction(() => {
    const projectId = db.run(
      `INSERT INTO project (name, client, country_id, city_id, currency, vat_pct, standard, library_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.client ?? null,
        country.id,
        input.cityId ?? null,
        country.base_currency,
        country.vat_pct,
        country.default_standard,
        library?.id ?? null
      ]
    )
    const estimateId = db.run('INSERT INTO estimate (project_id, revision) VALUES (?, 0)', [projectId])
    const markups: [string, string, number][] = [
      ['site_overhead', 'Site overheads', 1],
      ['head_office', 'Head office overheads', 2],
      ['risk', 'Contingency', 3],
      ['profit', 'Profit', 4]
    ]
    for (const [type, name, order] of markups) {
      db.run(
        'INSERT INTO markup (estimate_id, type, name, percent, sort_order) VALUES (?, ?, ?, ?, ?)',
        [estimateId, type, name, '0', order]
      )
    }
    return projectId
  })
}
