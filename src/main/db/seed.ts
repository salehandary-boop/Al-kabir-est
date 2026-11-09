import type Database from 'better-sqlite3'

/**
 * Starter country profiles. Values marked "to confirm" come from the plan and still
 * need checking by AL KABIR EST before real tenders.
 */
export function seedCountries(db: Database.Database): void {
  const has = db.prepare('SELECT COUNT(*) AS n FROM country_profile').get() as { n: number }
  if (has.n > 0) return

  const insertCountry = db.prepare(`
    INSERT INTO country_profile (code, name, base_currency, local_currency, vat_pct, default_standard, languages)
    VALUES (@code, @name, @base_currency, @local_currency, @vat_pct, @default_standard, @languages)`)
  const insertCity = db.prepare('INSERT INTO city (country_id, name, cost_factor) VALUES (?, ?, ?)')
  const insertLibrary = db.prepare(
    "INSERT INTO library (name, country_id, kind) VALUES (?, ?, 'master')"
  )

  db.transaction(() => {
    // Lebanon: USD pricing with LBP shown by exchange rate; VAT 11% (to confirm).
    const lb = insertCountry.run({
      code: 'LB',
      name: 'Lebanon',
      base_currency: 'USD',
      local_currency: 'LBP',
      vat_pct: '11',
      default_standard: 'POMI',
      languages: 'en,ar,fr'
    }).lastInsertRowid
    for (const city of ['Beirut', 'Mount Lebanon', 'Tripoli', 'Saida', 'Tyre', 'Zahle', 'Baalbek']) {
      insertCity.run(lb, city, '1')
    }
    insertLibrary.run('Lebanon master library', lb)
  })()
}
