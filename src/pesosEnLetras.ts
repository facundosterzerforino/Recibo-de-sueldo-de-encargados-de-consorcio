/** Texto orientativo para el recibo LCT (importes en pesos argentinos). */

const UNI = [
  '',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
]

const X10 = [
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
]

const DEC = [
  '',
  '',
  'veinte',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
]

const CEN = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
]

const VEINTI: Record<number, string> = {
  1: 'veintiuno',
  2: 'veintidós',
  3: 'veintitrés',
  4: 'veinticuatro',
  5: 'veinticinco',
  6: 'veintiséis',
  7: 'veintisiete',
  8: 'veintiocho',
  9: 'veintinueve',
}

function bajo100(n: number): string {
  if (n < 10) return UNI[n]
  if (n < 20) return X10[n - 10]
  if (n < 30) {
    if (n === 20) return 'veinte'
    return VEINTI[n - 20] ?? `veinti${UNI[n - 20]}`
  }
  const d = Math.floor(n / 10)
  const u = n % 10
  if (u === 0) return DEC[d] ?? ''
  return `${DEC[d]} y ${UNI[u]}`
}

function fragmentoCentenas(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const r = n % 100
  const pref = c > 0 ? CEN[c] : ''
  const suf = r > 0 ? (pref ? ' ' : '') + bajo100(r) : ''
  return (pref + suf).trim()
}

function hasta999999(n: number): string {
  if (n < 1000) return fragmentoCentenas(n) || 'cero'
  const miles = Math.floor(n / 1000)
  const resto = n % 1000
  const parteMiles =
    miles === 1 ? 'mil' : `${fragmentoCentenas(miles)} mil`.trim()
  const parteResto = resto ? ` ${fragmentoCentenas(resto)}` : ''
  return (parteMiles + parteResto).trim()
}

function enteroALetras(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '…'
  if (n === 0) return 'cero'
  if (n < 1_000_000) return hasta999999(n)
  const mill = Math.floor(n / 1_000_000)
  const resto = n % 1_000_000
  const head =
    mill === 1 ? 'un millón' : `${hasta999999(mill)} millones`.trim()
  if (!resto) return head
  return `${head} ${hasta999999(resto)}`.trim()
}

/** Ej.: "Son pesos: mil doscientos con 45/100." */
export function sonPesosEnLetras(valor: number): string {
  const cents = Math.round((valor + Number.EPSILON) * 100)
  const ent = Math.floor(cents / 100)
  const frac = Math.abs(cents % 100)
  let s = `Son pesos: ${enteroALetras(ent)}`
  if (frac > 0) {
    s += ` con ${frac.toString().padStart(2, '0')}/100`
  }
  s += '.'
  return s
}
