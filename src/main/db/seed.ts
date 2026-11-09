import type { Db } from './sqlite'

/**
 * Starter country profiles. Values marked "to confirm" come from the plan and still
 * need checking by AL KABIR EST before real tenders.
 */
export function seedCountries(db: Db): void {
  const has = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM country_profile')
  if (has && has.n > 0) return

  db.transaction(() => {
    // Lebanon: USD pricing with LBP shown by exchange rate; VAT 11% (to confirm).
    const lb = db.run(
      `INSERT INTO country_profile (code, name, base_currency, local_currency, vat_pct, default_standard, languages)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['LB', 'Lebanon', 'USD', 'LBP', '11', 'POMI', 'en,ar,fr']
    )
    for (const city of ['Beirut', 'Mount Lebanon', 'Tripoli', 'Saida', 'Tyre', 'Zahle', 'Baalbek']) {
      db.run('INSERT INTO city (country_id, name, cost_factor) VALUES (?, ?, ?)', [lb, city, '1'])
    }
    db.run("INSERT INTO library (name, country_id, kind) VALUES (?, ?, 'master')", [
      'Lebanon master library',
      lb
    ])
  })
}
