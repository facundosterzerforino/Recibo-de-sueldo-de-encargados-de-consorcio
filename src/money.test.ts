import { describe, expect, it } from 'vitest'
import { formatArs, parseArsInput, roundMoney } from './money'

describe('roundMoney', () => {
  it('redondea a dos decimales', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(10.999)).toBe(11)
    expect(roundMoney(0)).toBe(0)
  })
})

describe('parseArsInput', () => {
  it('interpreta formato argentino con coma decimal', () => {
    expect(parseArsInput('1.234,56')).toBe(1234.56)
    expect(parseArsInput('0,5')).toBe(0.5)
  })

  it('devuelve 0 ante texto inválido', () => {
    expect(parseArsInput('')).toBe(0)
    expect(parseArsInput('abc')).toBe(0)
  })
})

describe('formatArs', () => {
  it('formatea con símbolo de pesos y decimales', () => {
    const s = formatArs(1234.5)
    expect(s).toContain('$')
    expect(s).toMatch(/234/)
    expect(s).toMatch(/50|5/)
  })
})
