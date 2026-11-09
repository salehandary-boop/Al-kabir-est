import type { ClientApi } from '../../main/api'

/** Typed access to every main-process call, e.g. api.getBoq(estimateId). */
export const api = new Proxy({} as ClientApi, {
  get: (_t, name: string) => (...args: unknown[]) => window.api.call(name, ...args)
})
