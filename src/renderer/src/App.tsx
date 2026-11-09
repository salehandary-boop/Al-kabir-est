import { useEffect, useState } from 'react'
import type { CountryRow, ProjectRow } from '../../main/db/repo'

export function App() {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [countries, setCountries] = useState<CountryRow[]>([])
  const [cities, setCities] = useState<{ id: number; name: string }[]>([])
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [countryId, setCountryId] = useState<number>()
  const [cityId, setCityId] = useState<number>()

  const refresh = () => window.api.listProjects().then(setProjects)

  useEffect(() => {
    refresh()
    window.api.listCountries().then((cs) => {
      setCountries(cs)
      if (cs[0]) setCountryId(cs[0].id)
    })
  }, [])

  useEffect(() => {
    if (countryId) window.api.listCities(countryId).then(setCities)
  }, [countryId])

  const create = async () => {
    if (!name.trim() || !countryId) return
    await window.api.createProject({ name: name.trim(), client: client.trim() || undefined, countryId, cityId })
    setName('')
    setClient('')
    refresh()
  }

  return (
    <main>
      <header>
        <h1>AL KABIR EST</h1>
        <span>Construction estimation</span>
      </header>

      <section className="card">
        <h2>New project</h2>
        <div className="form">
          <input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Client" value={client} onChange={(e) => setClient(e.target.value)} />
          <select value={countryId} onChange={(e) => setCountryId(Number(e.target.value))}>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.base_currency}, VAT {c.vat_pct}%)
              </option>
            ))}
          </select>
          <select value={cityId ?? ''} onChange={(e) => setCityId(Number(e.target.value) || undefined)}>
            <option value="">City</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={create}>Create</button>
        </div>
      </section>

      <section className="card">
        <h2>Projects</h2>
        {projects.length === 0 ? (
          <p className="muted">No projects yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Location</th>
                <th>Currency</th>
                <th>Standard</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.client ?? ''}</td>
                  <td>{[p.city_name, p.country_name].filter(Boolean).join(', ')}</td>
                  <td>{p.currency}</td>
                  <td>{p.standard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
