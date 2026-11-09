import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { openDatabase, type Db } from './db'
import { api, type ApiName } from './api'

let db: Db

function registerHandlers(): void {
  // One channel for every call; errors go back to the screen as { error }.
  ipcMain.handle('api', async (e, name: ApiName, args: unknown[]) => {
    if (name === 'pickExcelFile') {
      const win = BrowserWindow.fromWebContents(e.sender)
      const r = await dialog.showOpenDialog(win!, {
        title: 'Import a BOQ from Excel',
        filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
        properties: ['openFile']
      })
      return { result: r.canceled ? null : r.filePaths[0] }
    }
    const fn = api[name] as ((db: Db, ...a: unknown[]) => unknown) | undefined
    if (!fn) return { error: `Unknown call ${String(name)}` }
    try {
      return { result: await fn(db, ...args) }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
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

app.whenReady().then(async () => {
  // One database file per company, kept in the user's app data folder for now.
  db = await openDatabase(join(app.getPath('userData'), 'company.sqlite'))
  registerHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  db?.close()
  if (process.platform !== 'darwin') app.quit()
})
