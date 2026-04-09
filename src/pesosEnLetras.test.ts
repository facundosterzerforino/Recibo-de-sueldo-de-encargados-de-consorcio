import { describe, expect, it } from 'vitest'
import { sonPesosEnLetras } from './pesosEnLetras'

describe('sonPesosEnLetras', () => {
  it('expresa enteros en palabras', () => {
    expect(sonPesosEnLetras(0)).toMatch(/cero/)
    expect(sonPesosEnLetras(1)).toMatch(/uno/)
    expect(sonPesosEnLetras(1000)).toMatch(/mil/)
  })

  it('incluye centavos cuando corresponde', () => {
    expect(sonPesosEnLetras(10.5)).toMatch(/50\/100/)
  })

  it('termina en punto', () => {
    expect(sonPesosEnLetras(500)).toMatch(/\.$/)
  })
})
