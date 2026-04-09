import type { SuterhAdicionalPlanilla } from './convenios/suterh'
import { SUTERH_PLANILLA_FATERYH_URL } from './convenios/suterh'
import type { AdicionalOverrideV1, ParsedPlanillaFateryh } from './planillaFateryhParser'

export type PlanillaCacheV1 = {
  version: 1
  fetchedAt: string
  sourceUrl: string
  overrides: Record<string, AdicionalOverrideV1>
  sumaFijaRemuneratoriaRef: number | null
}

const STORAGE_KEY = 'recibo-fateryh-planilla-v1'

export function loadPlanillaCache(): PlanillaCacheV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as unknown
    if (
      !p ||
      typeof p !== 'object' ||
      (p as PlanillaCacheV1).version !== 1 ||
      typeof (p as PlanillaCacheV1).fetchedAt !== 'string' ||
      typeof (p as PlanillaCacheV1).overrides !== 'object'
    ) {
      return null
    }
    return p as PlanillaCacheV1
  } catch {
    return null
  }
}

export function savePlanillaCache(data: PlanillaCacheV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota */
  }
}

export function clearPlanillaCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function buildPlanillaCacheFromParsed(
  parsed: ParsedPlanillaFateryh,
): PlanillaCacheV1 {
  return {
    version: 1,
    fetchedAt: new Date().toISOString(),
    sourceUrl: SUTERH_PLANILLA_FATERYH_URL,
    overrides: parsed.overrides,
    sumaFijaRemuneratoriaRef: parsed.sumaFijaRemuneratoriaRef,
  }
}

export function mergeAdicionalesPlanilla(
  base: SuterhAdicionalPlanilla[],
  overrides: Record<string, AdicionalOverrideV1> | null | undefined,
): SuterhAdicionalPlanilla[] {
  if (!overrides || Object.keys(overrides).length === 0) return base
  return base.map((def) => {
    const o = overrides[def.id]
    if (!o) return def
    if (def.kind === 'fijo' && o.kind === 'fijo') {
      return { ...def, importe: o.importe }
    }
    if (def.kind === 'pct_basico' && o.kind === 'pct_basico') {
      return { ...def, porcentaje: o.porcentaje }
    }
    if (def.kind === 'por_unidad' && o.kind === 'por_unidad') {
      return { ...def, importePorUnidad: o.importePorUnidad }
    }
    return def
  })
}

/**
 * En desarrollo usa el proxy de Vite. En producción intenta la URL directa (puede fallar por CORS);
 * se puede definir `VITE_FATERYH_PLANILLA_PROXY` con una URL absoluta a tu propio proxy.
 */
export function resolvePlanillaFetchUrl(): string {
  const proxied = import.meta.env.VITE_FATERYH_PLANILLA_PROXY as
    | string
    | undefined
  if (proxied && proxied.length > 0) return proxied
  if (import.meta.env.DEV) return '/api/fateryh-planilla'
  return SUTERH_PLANILLA_FATERYH_URL
}
