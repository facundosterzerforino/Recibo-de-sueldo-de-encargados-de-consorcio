import { roundMoney } from './money'

/** Coincide con `SUTERH_ADICIONALES_PLANILLA[].id` en `convenios/suterh.ts`. */
export type AdicionalOverrideV1 =
  | { kind: 'fijo'; importe: number }
  | { kind: 'pct_basico'; porcentaje: number }
  | { kind: 'por_unidad'; importePorUnidad: number }

export type ParsedPlanillaFateryh = {
  overrides: Record<string, AdicionalOverrideV1>
  sumaFijaRemuneratoriaRef: number | null
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Montos tipo 1.786,90 o 120.000 (miles con punto). */
export function parseArsCell(raw: string): number {
  let s = raw.replace(/\u00a0/g, ' ').replace(/\s/g, '')
  if (!s || /%/i.test(s)) return Number.NaN
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/\./g, '')
  }
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? roundMoney(n) : Number.NaN
}

function parsePctCell(raw: string): number {
  const s = raw.replace(/\u00a0/g, ' ')
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*%/i)
  if (!m) return Number.NaN
  return Number.parseFloat(m[1].replace(',', '.'))
}

function matchAdicionalId(label: string): string | null {
  const n = norm(label)
  const rules: [string, (x: string) => boolean][] = [
    ['adic-retiro-residuos-unidad', (x) => x.includes('retiro de residuos')],
    [
      'adic-clasif-residuos',
      (x) => x.includes('clasificacion de residuos') || x.includes('clasificacion de residuo'),
    ],
    ['adic-valor-vivienda', (x) => x.includes('valor vivienda')],
    [
      'adic-plus-ant-106',
      (x) =>
        x.includes('antig') &&
        (x.includes('106/09') ||
          x.includes('106 / 09') ||
          (x.includes('resoluc') && x.includes('106'))),
    ],
    [
      'adic-plus-ant-art11',
      (x) =>
        x.includes('antig') &&
        (x.includes('art. 11') || x.includes('art 11')) &&
        !x.includes('106'),
    ],
    ['adic-limpieza-cocheras', (x) => x.includes('limpieza') && x.includes('cochera')],
    [
      'adic-mov-coches',
      (x) =>
        (x.includes('movimiento') || x.includes('moviemiento')) &&
        x.includes('coche'),
    ],
    ['adic-jardin', (x) => x.includes('plus') && x.includes('jardin')],
    ['adic-zona-desfavorable', (x) => x.includes('zona') && x.includes('desfavorable')],
    [
      'adic-titulo-encargado-integral',
      (x) => x.includes('titulo') && x.includes('encargado integral'),
    ],
    [
      'adic-piletas',
      (x) => x.includes('pileta') || x.includes('mantenimiento del agua'),
    ],
    ['adic-viaticos', (x) => x.includes('viatico')],
  ]
  for (const [id, test] of rules) {
    if (test(n)) return id
  }
  return null
}

function parseSumaFijaFromHtml(html: string): number | null {
  const m = html.match(
    /Adicional\s+Remuneratorio\s+Mensual[^$]*\$\s*([\d.]+)/i,
  )
  if (!m) return null
  const digits = m[1].replace(/\./g, '')
  const n = Number.parseInt(digits, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Extrae la tabla «Adicionales Para Cualquiera de las Categorías» del HTML de la página FATERYH.
 */
export function parsePlanillaFateryhHtml(html: string): ParsedPlanillaFateryh {
  const sumaFijaRemuneratoriaRef = parseSumaFijaFromHtml(html)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const h3 = [...doc.querySelectorAll('h3')].find((el) => {
    const t = norm(el.textContent || '')
    return t.includes('adicionales') && t.includes('categorias')
  })

  if (!h3) {
    return { overrides: {}, sumaFijaRemuneratoriaRef }
  }

  let table: Element | null = h3.nextElementSibling
  while (table && table.tagName !== 'TABLE') {
    table = table.nextElementSibling
  }
  if (!table || table.tagName !== 'TABLE') {
    return { overrides: {}, sumaFijaRemuneratoriaRef }
  }

  const overrides: Record<string, AdicionalOverrideV1> = {}

  for (const tr of table.querySelectorAll('tr')) {
    const tds = tr.querySelectorAll('td')
    if (tds.length < 2) continue
    const label = (tds[0].textContent || '').trim()
    const valueCell = (tds[1].textContent || '').trim()
    if (!label || !valueCell) continue

    const id = matchAdicionalId(label)
    if (!id) continue

    if (/%/.test(valueCell)) {
      const porcentaje = parsePctCell(valueCell)
      if (Number.isFinite(porcentaje) && porcentaje > 0) {
        overrides[id] = { kind: 'pct_basico', porcentaje }
      }
      continue
    }

    const importe = parseArsCell(valueCell)
    if (!Number.isFinite(importe)) continue

    if (id === 'adic-retiro-residuos-unidad') {
      overrides[id] = { kind: 'por_unidad', importePorUnidad: importe }
    } else {
      overrides[id] = { kind: 'fijo', importe }
    }
  }

  return { overrides, sumaFijaRemuneratoriaRef }
}
