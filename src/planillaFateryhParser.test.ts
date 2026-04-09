import { describe, expect, it } from 'vitest'
import { parseArsCell, parsePlanillaFateryhHtml } from './planillaFateryhParser'

describe('parseArsCell', () => {
  it('parsea miles con punto y decimales con coma', () => {
    expect(parseArsCell('1.786,90')).toBe(1786.9)
    expect(parseArsCell('30.777,30')).toBe(30777.3)
  })

  it('parsea miles sin parte decimal', () => {
    expect(parseArsCell('120.000')).toBe(120000)
  })

  it('devuelve NaN para porcentajes o vacío', () => {
    expect(Number.isNaN(parseArsCell('50 %'))).toBe(true)
    expect(Number.isNaN(parseArsCell(''))).toBe(true)
  })
})

/** Fragmento mínimo con la misma estructura que la página FATERYH. */
const HTML_PLANILLA_MIN = `<!DOCTYPE html><html><body>
<p><strong>Adicional Remuneratorio Mensual para todas las Categorías de CCT $ 120.000.-, proporcional a cada categoría</strong></p>
<h3>Adicionales Para Cualquiera de las Categorías</h3>
<table><tbody>
<tr><td>Retiro de residuos por unidad destinada a vivienda u oficina</td><td>1.786,90</td></tr>
<tr><td>Plus Zona Desfavorable</td><td>50 %</td></tr>
<tr><td>Titulo de Encargado Integral de Edificio</td><td>10 %</td></tr>
</tbody></table>
</body></html>`

describe('parsePlanillaFateryhHtml', () => {
  it('extrae suma fija remuneratoria global', () => {
    const { sumaFijaRemuneratoriaRef } = parsePlanillaFateryhHtml(HTML_PLANILLA_MIN)
    expect(sumaFijaRemuneratoriaRef).toBe(120000)
  })

  it('mapea filas conocidas de la tabla de adicionales', () => {
    const { overrides } = parsePlanillaFateryhHtml(HTML_PLANILLA_MIN)
    expect(overrides['adic-retiro-residuos-unidad']).toEqual({
      kind: 'por_unidad',
      importePorUnidad: 1786.9,
    })
    expect(overrides['adic-zona-desfavorable']).toEqual({
      kind: 'pct_basico',
      porcentaje: 50,
    })
    expect(overrides['adic-titulo-encargado-integral']).toEqual({
      kind: 'pct_basico',
      porcentaje: 10,
    })
  })

  it('sin tabla de adicionales devuelve overrides vacíos', () => {
    const r = parsePlanillaFateryhHtml('<html><body><p>vacío</p></body></html>')
    expect(Object.keys(r.overrides).length).toBe(0)
  })
})
