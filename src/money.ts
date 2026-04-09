const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatArs(value: number): string {
  if (!Number.isFinite(value)) return ars.format(0)
  return ars.format(value)
}

export function parseArsInput(raw: string): number {
  const n = raw
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const v = Number.parseFloat(n)
  return Number.isFinite(v) ? v : 0
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
