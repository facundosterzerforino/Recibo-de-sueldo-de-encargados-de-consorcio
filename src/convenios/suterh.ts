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

/**
 * Suma fija remunerativa referida en acuerdos 2026 (prensa especializada).
 * En el convenio suele abonarse en proporción a la categoría / modalidad: ajustá el importe según acta homologada.
 */
export const SUTERH_SUMA_FIJA_REMUNERATIVA_REF = 120_000

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

/** Planilla oficial en el sitio de FATERYH (actualizar valores si cambia el mes de referencia). */
export const SUTERH_PLANILLA_FATERYH_URL =
  'https://fateryh.org.ar/planilla-salarial-vigente/' as const

export type SuterhAdicionalPlanilla =
  | {
      id: string
      kind: 'fijo'
      concepto: string
      importe: number
    }
  | {
      id: string
      kind: 'pct_basico'
      concepto: string
      porcentaje: number
    }
  | {
      id: string
      kind: 'por_unidad'
      concepto: string
      importePorUnidad: number
    }

/**
 * Adicionales «para cualquiera de las categorías» y montos fijos de la planilla
 * publicada (marzo 2026). Contrastar siempre con la homologación vigente.
 */
export const SUTERH_ADICIONALES_PLANILLA: SuterhAdicionalPlanilla[] = [
  {
    id: 'adic-retiro-residuos-unidad',
    kind: 'por_unidad',
    concepto: 'Retiro de residuos por unidad (vivienda u oficina)',
    importePorUnidad: 1786.9,
  },
  {
    id: 'adic-clasif-residuos',
    kind: 'fijo',
    concepto: 'Clasificación de residuos (Resol. 2013-243 SSRT-GCABA)',
    importe: 30777.3,
  },
  {
    id: 'adic-valor-vivienda',
    kind: 'fijo',
    concepto: 'Valor vivienda',
    importe: 6564.6,
  },
  {
    id: 'adic-plus-ant-106',
    kind: 'fijo',
    concepto:
      'Plus antigüedad (Resol. 106/09 — inc. art. 7 y 8, ref. 1% por año)',
    importe: 9701.8,
  },
  {
    id: 'adic-plus-ant-art11',
    kind: 'fijo',
    concepto: 'Plus antigüedad (art. 11 convenio — ref. 2% por año)',
    importe: 19403.6,
  },
  {
    id: 'adic-limpieza-cocheras',
    kind: 'fijo',
    concepto: 'Plus limpieza de cocheras',
    importe: 24385,
  },
  {
    id: 'adic-mov-coches',
    kind: 'fijo',
    concepto: 'Plus movimiento de coches (hasta 20 unidades)',
    importe: 36104.6,
  },
  {
    id: 'adic-jardin',
    kind: 'fijo',
    concepto: 'Plus jardín',
    importe: 24385,
  },
  {
    id: 'adic-zona-desfavorable',
    kind: 'pct_basico',
    concepto: 'Plus zona desfavorable',
    porcentaje: 50,
  },
  {
    id: 'adic-titulo-encargado-integral',
    kind: 'pct_basico',
    concepto: 'Título encargado integral de edificio',
    porcentaje: 10,
  },
  {
    id: 'adic-piletas',
    kind: 'fijo',
    concepto: 'Plus limpieza de piletas y mantenimiento del agua',
    importe: 41021.6,
  },
  {
    id: 'adic-viaticos',
    kind: 'fijo',
    concepto: 'Adicional viáticos',
    importe: 67912.5,
  },
]
