import { contextBridge, ipcRenderer } from 'electron'

async function call(name: string, ...args: unknown[]): Promise<unknown> {
  const res = (await ipcRenderer.invoke('api', name, args)) as { result?: unknown; error?: string }
  if (res.error) throw new Error(res.error)
  return res.result
}

// A proxy so every call in src/main/api.ts is available as window.api.<name>(...).
contextBridge.exposeInMainWorld('api', {
  call
})
