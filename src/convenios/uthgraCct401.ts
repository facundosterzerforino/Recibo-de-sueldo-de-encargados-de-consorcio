/**
 * UTHGRA — CCT 401/05 (comedores / CACYR-CAECSAL, establecimientos públicos).
 * No reemplaza al convenio de encargados de edificio (SUTERH); se ofrece como
 * referencia para quienes liquidan personal bajo ese CCT.
 * Básicos: referencia marzo 2026 (fuentes de prensa / agregadores salariales).
 */
export const UTHGRA_401_META = {
  nombre: 'UTHGRA — CCT 401/05',
  anexo: 'Establecimientos públicos (referencia)',
  nota: 'Incluye básico de marzo 2026 y suma no remunerativa (SNR) abonada aparte hasta su incorporación al básico. Ver acto de homologación.',
} as const

export type Uthgra401Row = {
  id: string
  categoria: number
  label: string
  basicoMarzo2026: number
  /** Suma no remunerativa mensual (referencia). */
  snrMarzo2026: number
}

export const UTHGRA_CCT401_PUBLICOS: Uthgra401Row[] = [
  { id: 'u401-1', categoria: 1, label: 'Cat. 1 — comedores públicos', basicoMarzo2026: 1_253_380, snrMarzo2026: 30_177 },
  { id: 'u401-2', categoria: 2, label: 'Cat. 2 — comedores públicos', basicoMarzo2026: 1_317_595, snrMarzo2026: 31_723 },
  { id: 'u401-3', categoria: 3, label: 'Cat. 3 — comedores públicos', basicoMarzo2026: 1_382_572, snrMarzo2026: 33_287 },
  { id: 'u401-4', categoria: 4, label: 'Cat. 4 — comedores públicos', basicoMarzo2026: 1_465_554, snrMarzo2026: 35_285 },
  { id: 'u401-5', categoria: 5, label: 'Cat. 5 — comedores públicos', basicoMarzo2026: 1_552_497, snrMarzo2026: 37_379 },
  { id: 'u401-6', categoria: 6, label: 'Cat. 6 — comedores públicos', basicoMarzo2026: 1_863_129, snrMarzo2026: 44_857 },
  { id: 'u401-7', categoria: 7, label: 'Cat. 7 — comedores públicos', basicoMarzo2026: 2_175_825, snrMarzo2026: 52_386 },
]
