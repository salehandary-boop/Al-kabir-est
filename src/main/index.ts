import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { openDatabase } from './db'
import { createProject, listCities, listCountries, listProjects, type NewProject } from './db/repo'

// One database file per company, kept in the user's app data folder for now.
const db = openDatabase(join(app.getPath('userData'), 'company.sqlite'))

ipcMain.handle('countries:list', () => listCountries(db))
ipcMain.handle('cities:list', (_e, countryId: number) => listCities(db, countryId))
ipcMain.handle('projects:list', () => listProjects(db))
ipcMain.handle('projects:create', (_e, input: NewProject) => createProject(db, input))

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AL KABIR EST',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  db.close()
  if (process.platform !== 'darwin') app.quit()
})
