import { contextBridge, ipcRenderer } from 'electron'
import type { NewProject } from '../main/db/repo'

const api = {
  listCountries: () => ipcRenderer.invoke('countries:list'),
  listCities: (countryId: number) => ipcRenderer.invoke('cities:list', countryId),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (input: NewProject) => ipcRenderer.invoke('projects:create', input)
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
