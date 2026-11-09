import { useEffect, useState } from 'react'
import type { CountryRow, ProjectRow } from '../../main/db/repo'
import { api } from './api'

export function ProjectsPage({ onOpen, onError }: { onOpen: (projectId: number) => void; onError: (m: string) => void }) {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [countries, setCountries] = useState<CountryRow[]>([])
  const [cities, setCities] = useState<{ id: number; name: string }[]>([])
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [countryId, setCountryId] = useState<number>()
  const [cityId, setCityId] = useState<number>()

  const refresh = () => api.listProjects().then(setProjects).catch((e) => onError(e.message))

  useEffect(() => {
    refresh()
    api.listCountries().then((cs) => {
      setCountries(cs)
      if (cs[0]) setCountryId(cs[0].id)
    })
  }, [])

  useEffect(() => {
    if (countryId) api.listCities(countryId).then(setCities)
  }, [countryId])

  const create = async () => {
    if (!name.trim() || !countryId) return onError('Enter a project name first.')
    try {
      const id = await api.createProject({ name: name.trim(), client: client.trim() || undefined, countryId, cityId })
      setName('')
      setClient('')
      onOpen(id)
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <>
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
          <table className="list">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Location</th>
                <th>Currency</th>
                <th>Standard</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => onOpen(p.id)}>
                  <td>{p.name}</td>
                  <td>{p.client ?? ''}</td>
                  <td>{[p.city_name, p.country_name].filter(Boolean).join(', ')}</td>
                  <td>{p.currency}</td>
                  <td>{p.standard}</td>
                  <td className="link">Open BOQ →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
