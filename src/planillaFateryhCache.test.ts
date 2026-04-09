import { describe, expect, it } from 'vitest'
import { SUTERH_ADICIONALES_PLANILLA } from './convenios/suterh'
import { mergeAdicionalesPlanilla } from './planillaFateryhCache'

describe('mergeAdicionalesPlanilla', () => {
  it('devuelve la base sin overrides vacíos', () => {
    const r = mergeAdicionalesPlanilla(SUTERH_ADICIONALES_PLANILLA, undefined)
    expect(r).toEqual(SUTERH_ADICIONALES_PLANILLA)
    expect(mergeAdicionalesPlanilla(SUTERH_ADICIONALES_PLANILLA, {})).toEqual(
      SUTERH_ADICIONALES_PLANILLA,
    )
  })

  it('sobrescribe importes fijos por id', () => {
    const merged = mergeAdicionalesPlanilla(SUTERH_ADICIONALES_PLANILLA, {
      'adic-viaticos': { kind: 'fijo', importe: 99999 },
    })
    const viaticos = merged.find((x) => x.id === 'adic-viaticos')
    expect(viaticos && viaticos.kind === 'fijo' && viaticos.importe).toBe(99999)
  })

  it('sobrescribe porcentaje sobre básico', () => {
    const merged = mergeAdicionalesPlanilla(SUTERH_ADICIONALES_PLANILLA, {
      'adic-zona-desfavorable': { kind: 'pct_basico', porcentaje: 55 },
    })
    const z = merged.find((x) => x.id === 'adic-zona-desfavorable')
    expect(z && z.kind === 'pct_basico' && z.porcentaje).toBe(55)
  })

  it('no mezcla kinds incompatibles', () => {
    const merged = mergeAdicionalesPlanilla(SUTERH_ADICIONALES_PLANILLA, {
      'adic-viaticos': { kind: 'pct_basico', porcentaje: 5 },
    })
    const v = merged.find((x) => x.id === 'adic-viaticos')
    expect(v && v.kind === 'fijo').toBe(true)
  })
})
