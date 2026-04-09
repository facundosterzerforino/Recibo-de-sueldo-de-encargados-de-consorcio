export const AGENDA_STORAGE_KEY = 'recibo-encargados-agenda-v1'

export type StoredMoneyLine = {
  id: string
  concepto: string
  importe: number
  unidad?: string
}

export type StoredEncargado = {
  id: string
  nombre: string
  cuil: string
  categoria: string
  fechaIngreso: string
  antiguedadDesdeFecha: boolean
  aniosAntiguedadManual: number
  pctAntiguedadAnual: number
  horasNormalesMes: number
  horasExtra50: number
  horasExtra100: number
  suterhEscalaId: string
  uthgraEscalaId: string
  importeSumaFijaRem: number
  bonoConEscalaSuterh: boolean
  haberes: StoredMoneyLine[]
  descuentos: StoredMoneyLine[]
  /** Opcional: campos extra del modelo recibo Ley 20.744 */
  reciboLegajo?: string
  reciboObraSocial?: string
  reciboTipoContrato?: string
  reciboTareaDesempeniada?: string
  reciboAntiguedadReconocida?: string
  reciboUltimoDeposito?: string
  reciboBanco?: string
  reciboCbu?: string
  reciboLugarPago?: string
}

export type StoredConsorcio = {
  id: string
  nombre: string
  cuit: string
  domicilio: string
  encargados: StoredEncargado[]
}

export type AgendaState = {
  version: 1
  consorcios: StoredConsorcio[]
}

export function loadAgenda(): AgendaState {
  try {
    const raw = localStorage.getItem(AGENDA_STORAGE_KEY)
    if (!raw) return { version: 1, consorcios: [] }
    const p = JSON.parse(raw) as unknown
    if (
      p &&
      typeof p === 'object' &&
      'consorcios' in p &&
      Array.isArray((p as AgendaState).consorcios)
    ) {
      return { version: 1, consorcios: (p as AgendaState).consorcios }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { version: 1, consorcios: [] }
}

export function persistAgenda(state: AgendaState): void {
  try {
    localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota or private mode */
  }
}

export function findConsorcio(
  agenda: AgendaState,
  id: string,
): StoredConsorcio | undefined {
  return agenda.consorcios.find((c) => c.id === id)
}

export function findEncargado(
  consorcio: StoredConsorcio | undefined,
  encargadoId: string,
): StoredEncargado | undefined {
  return consorcio?.encargados.find((e) => e.id === encargadoId)
}
