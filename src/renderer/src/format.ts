/** Shows 12345.5 as 12,345.50 for reading; data stays exact in the database. */
export function fmt(value: string, decimals = 2): string {
  const n = Number(value)
  if (value === '' || Number.isNaN(n)) return value
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtQty(value: string): string {
  const n = Number(value)
  if (value === '' || Number.isNaN(n)) return value
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
}
