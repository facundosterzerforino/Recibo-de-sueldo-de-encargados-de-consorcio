/**
 * Referencia salarial SUTERH / FATERYH — CCT 589/10 y 590/10 (encargados de edificio).
 * Valores tomados de información pública (prensa, marzo 2026). Deben contrastarse
 * siempre con la planilla oficial homologada en el Ministerio de Trabajo.
 */
export const SUTERH_META = {
  nombre: 'SUTERH / FATERYH',
  cct: 'CCT 589/10 y 590/10',
  nota: 'Encargados de edificio y personal de consorcios. Verificar monto vigente en escala oficial.',
} as const

export type SuterhCategoria = 1 | 2 | 3 | 4

export type SuterhModalidad = 'con_vivienda' | 'sin_vivienda'

export type SuterhEscalaRow = {
  id: string
  categoria: SuterhCategoria
  modalidad: SuterhModalidad
  label: string
  basicoMensual: number
}

/** Planilla divulgada (marzo 2026, prensa especializada). */
export const SUTERH_ENCARGADO_PERMANENTE: SuterhEscalaRow[] = [
  {
    id: 'sut-ep-1c',
    categoria: 1,
    modalidad: 'con_vivienda',
    label: 'Encargado permanente — 1ª cat. — con vivienda',
    basicoMensual: 999_938,
  },
  {
    id: 'sut-ep-2c',
    categoria: 2,
    modalidad: 'con_vivienda',
    label: 'Encargado permanente — 2ª cat. — con vivienda',
    basicoMensual: 958_274,
  },
  {
    id: 'sut-ep-3c',
    categoria: 3,
    modalidad: 'con_vivienda',
    label: 'Encargado permanente — 3ª cat. — con vivienda',
    basicoMensual: 916_610,
  },
  {
    id: 'sut-ep-4c',
    categoria: 4,
    modalidad: 'con_vivienda',
    label: 'Encargado permanente — 4ª cat. — con vivienda',
    basicoMensual: 833_282,
  },
  {
    id: 'sut-ep-1s',
    categoria: 1,
    modalidad: 'sin_vivienda',
    label: 'Encargado permanente — 1ª cat. — sin vivienda',
    basicoMensual: 1_164_214,
  },
  {
    id: 'sut-ep-2s',
    categoria: 2,
    modalidad: 'sin_vivienda',
    label: 'Encargado permanente — 2ª cat. — sin vivienda',
    basicoMensual: 1_115_705,
  },
  {
    id: 'sut-ep-3s',
    categoria: 3,
    modalidad: 'sin_vivienda',
    label: 'Encargado permanente — 3ª cat. — sin vivienda',
    basicoMensual: 1_067_196,
  },
  {
    id: 'sut-ep-4s',
    categoria: 4,
    modalidad: 'sin_vivienda',
    label: 'Encargado permanente — 4ª cat. — sin vivienda',
    basicoMensual: 970_178,
  },
]
