export {}

declare global {
  interface Window {
    api: { call(name: string, ...args: unknown[]): Promise<unknown> }
  }
}
