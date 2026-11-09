import type { Db } from './db'
import * as boq from './db/boq'
import * as repo from './db/repo'
import { importExcelFile } from './importExcel'

/** Every call the screen can make. Each takes the database plus plain arguments. */
export const api = {
  listCountries: (db: Db) => repo.listCountries(db),
  listCities: (db: Db, countryId: number) => repo.listCities(db, countryId),
  listProjects: (db: Db) => repo.listProjects(db),
  createProject: (db: Db, input: repo.NewProject) => repo.createProject(db, input),

  latestEstimateId: (db: Db, projectId: number) => boq.latestEstimateId(db, projectId),
  getBoq: (db: Db, estimateId: number) => boq.getBoq(db, estimateId),
  trades: () => boq.TRADES,
  addPart: (db: Db, estimateId: number, input: { code?: string; name?: string }) => boq.addPart(db, estimateId, input),
  updatePart: (db: Db, id: number, input: { code?: string; name?: string }) => boq.updatePart(db, id, input),
  deletePart: (db: Db, id: number) => boq.deletePart(db, id),
  addSection: (db: Db, partId: number, input: { code?: string; title?: string }) => boq.addSection(db, partId, input),
  updateSection: (db: Db, id: number, input: { code?: string; title?: string }) => boq.updateSection(db, id, input),
  deleteSection: (db: Db, id: number) => boq.deleteSection(db, id),
  addItem: (db: Db, sectionId: number) => boq.addItem(db, sectionId),
  updateItem: (db: Db, id: number, changes: boq.ItemChanges) => boq.updateItem(db, id, changes),
  deleteItem: (db: Db, id: number) => boq.deleteItem(db, id),
  listTakeoff: (db: Db, itemId: number) => boq.listTakeoff(db, itemId),
  addTakeoff: (db: Db, itemId: number) => boq.addTakeoff(db, itemId),
  updateTakeoff: (db: Db, id: number, changes: boq.TakeoffChanges) => boq.updateTakeoff(db, id, changes),
  deleteTakeoff: (db: Db, id: number) => boq.deleteTakeoff(db, id),
  updateMarkup: (db: Db, id: number, percent: string) => boq.updateMarkup(db, id, percent),
  setExchangeRate: (db: Db, estimateId: number, rate: string) => boq.setExchangeRate(db, estimateId, rate),
  importExcel: (db: Db, estimateId: number, file: string) => importExcelFile(db, estimateId, file),
  /** Handled in the main process with a file dialog; listed here only for its type. */
  pickExcelFile: (_db: Db): string | null => null
}

export type ApiName = keyof typeof api
type Rest<F> = F extends (db: Db, ...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : F extends () => infer R ? () => Promise<R> : never
/** The same calls as seen from the screen: no database argument, and asynchronous. */
export type ClientApi = { [K in ApiName]: Rest<(typeof api)[K]> }
