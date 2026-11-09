import type { CountryRow, ProjectRow, NewProject } from '../../main/db/repo'

declare global {
  interface Window {
    api: {
      listCountries(): Promise<CountryRow[]>
      listCities(countryId: number): Promise<{ id: number; name: string }[]>
      listProjects(): Promise<ProjectRow[]>
      createProject(input: NewProject): Promise<number>
    }
  }
}
