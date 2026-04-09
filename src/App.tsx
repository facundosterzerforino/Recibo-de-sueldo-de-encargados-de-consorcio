import { useCallback, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  type AgendaState,
  type StoredEncargado,
  findConsorcio,
  findEncargado,
  loadAgenda,
  persistAgenda,
} from './agendaStorage'
import {
  SUTERH_ADICIONALES_PLANILLA,
  SUTERH_ENCARGADO_PERMANENTE,
  SUTERH_META,
  SUTERH_PLANILLA_FATERYH_URL,
  SUTERH_SUMA_FIJA_REMUNERATIVA_REF,
  UTHGRA_401_META,
  UTHGRA_CCT401_PUBLICOS,
  type SuterhAdicionalPlanilla,
} from './convenios'
import { formatArs, parseArsInput, roundMoney } from './money'
import {
  buildPlanillaCacheFromParsed,
  clearPlanillaCache,
  loadPlanillaCache,
  mergeAdicionalesPlanilla,
  resolvePlanillaFetchUrl,
  savePlanillaCache,
  type PlanillaCacheV1,
} from './planillaFateryhCache'
import { parsePlanillaFateryhHtml } from './planillaFateryhParser'
import { sonPesosEnLetras } from './pesosEnLetras'
import { exportElementToPdf } from './pdfExport'

type MoneyLine = {
  id: string
  concepto: string
  importe: number
  /** Unidades, días o % que se muestran en el recibo LCT (columna «Un.»). */
  unidad?: string
}

const LCT_CONTRIB_IZQ = [
  'SIPA (Ley 24.241)',
  'INSSJP — PAMI (Ley 19.032)',
  'Asignaciones familiares',
  'FNE / cese laboral (si corresponde)',
  'ART — riesgos del trabajo',
] as const

const LCT_CONTRIB_DER = [
  'Obra social — aporte empleador',
  'Contribución adicional OS (si corresponde)',
  'Aportes sindicales empleador (si corresponde)',
  'Otros aportes / tasas',
  '—',
] as const

const CONCEPTO_BASICO_DEFAULT = 'Sueldo básico / jornal mensual'
const CONCEPTO_ANTIGUEDAD = 'Antigüedad (convenio)'
const CONCEPTO_HE50 = 'Horas extras al 50%'
const CONCEPTO_HE100 = 'Horas extras al 100%'
const CONCEPTO_SUMA_FIJA_REM = 'Suma fija remunerativa (SUTERH — ref.)'

function newLine(partial?: Partial<MoneyLine>): MoneyLine {
  return {
    id: crypto.randomUUID(),
    concepto: partial?.concepto ?? '',
    importe: partial?.importe ?? 0,
    unidad: partial?.unidad ?? '',
  }
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

const defaultHaberes: MoneyLine[] = [
  newLine({ concepto: CONCEPTO_BASICO_DEFAULT, importe: 0 }),
]

const defaultDescuentos: MoneyLine[] = [
  newLine({ concepto: 'Jubilación (aportes)', importe: 0 }),
  newLine({ concepto: 'PAMI / Ley 19.032', importe: 0 }),
  newLine({ concepto: 'Obra social', importe: 0 }),
]

function finDePeriodo(anio: number, mesIdx: number): Date {
  return new Date(anio, mesIdx + 1, 0)
}

function aniosCompletosDesde(fechaIngresoStr: string, fin: Date): number {
  const d = new Date(`${fechaIngresoStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return 0
  let años = fin.getFullYear() - d.getFullYear()
  const m = fin.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && fin.getDate() < d.getDate())) años--
  return Math.max(0, años)
}

function ensureFirstBasico(rows: MoneyLine[], importe: number): MoneyLine[] {
  const next = [...rows]
  if (next.length === 0) {
    return [newLine({ concepto: CONCEPTO_BASICO_DEFAULT, importe })]
  }
  next[0] = {
    ...next[0],
    concepto: next[0].concepto?.trim() ? next[0].concepto : CONCEPTO_BASICO_DEFAULT,
    importe,
  }
  return next
}

function basicoDesdeHaberes(rows: MoneyLine[]): number {
  return rows[0]?.importe ?? 0
}

/** Inserta o actualiza la línea de suma fija remunerativa justo después del básico (primera fila). */
function incorporarSumaFijaEnHaberes(
  rows: MoneyLine[],
  importe: number,
): MoneyLine[] {
  const filtered = rows.filter((r) => r.concepto !== CONCEPTO_SUMA_FIJA_REM)
  const imp = roundMoney(importe)
  if (imp <= 0) return filtered
  const line = newLine({ concepto: CONCEPTO_SUMA_FIJA_REM, importe: imp })
  if (filtered.length === 0) return [line]
  return [filtered[0], line, ...filtered.slice(1)]
}

function cloneMoneyLines(rows: MoneyLine[]): MoneyLine[] {
  return rows.map((r) => ({ ...r }))
}

function unidadHaberEnRecibo(l: MoneyLine, index: number): string {
  const u = l.unidad?.trim()
  if (u) return u
  if (index === 0) return '30'
  return '—'
}

function unidadDescuentoEnRecibo(l: MoneyLine): string {
  const u = l.unidad?.trim()
  return u || '—'
}

function soloDigitosCuil(s: string): string {
  return s.replace(/\D/g, '')
}

function cuilPareceCompleto(d: string): boolean {
  return d.length >= 10
}

/**
 * Si el combo sigue en un encargado guardado pero el formulario ya muestra otra persona
 * (nombre distinto, o CUIL distinto cuando ambos están completos), generamos un id nuevo
 * y se hace push en lugar de pisar la ficha anterior.
 */
function resolverIdEncargadoAlGuardar(
  selectedEncargadoId: string | null,
  existing: StoredEncargado | undefined,
  nombreForm: string,
  cuilForm: string,
): string {
  if (!selectedEncargadoId || !existing) return crypto.randomUUID()

  const nF = nombreForm.trim().toLowerCase()
  const nE = existing.nombre.trim().toLowerCase()
  const cuilF = soloDigitosCuil(cuilForm)
  const cuilE = soloDigitosCuil(existing.cuil)

  if (nF === nE) return selectedEncargadoId

  if (
    cuilPareceCompleto(cuilF) &&
    cuilPareceCompleto(cuilE) &&
    cuilF === cuilE
  ) {
    return selectedEncargadoId
  }

  return crypto.randomUUID()
}

function App() {
  const reciboRef = useRef<HTMLElement | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const [agenda, setAgenda] = useState<AgendaState>(() => loadAgenda())
  const [selectedConsorcioId, setSelectedConsorcioId] = useState<string | null>(
    null,
  )
  const [selectedEncargadoId, setSelectedEncargadoId] = useState<string | null>(
    null,
  )

  const [consorcioNombre, setConsorcioNombre] = useState('')
  const [consorcioCuit, setConsorcioCuit] = useState('')
  const [consorcioDomicilio, setConsorcioDomicilio] = useState('')

  const [empleadoNombre, setEmpleadoNombre] = useState('')
  const [empleadoCuil, setEmpleadoCuil] = useState('')
  const [empleadoCategoria, setEmpleadoCategoria] = useState(
    'Encargado de edificio / consorcio',
  )

  const [reciboLegajo, setReciboLegajo] = useState('')
  const [reciboObraSocial, setReciboObraSocial] = useState('')
  const [reciboTipoContrato, setReciboTipoContrato] = useState(
    'Por tiempo indeterminado',
  )
  const [reciboTareaDesempeniada, setReciboTareaDesempeniada] = useState('')
  const [reciboAntiguedadReconocida, setReciboAntiguedadReconocida] =
    useState('')
  const [reciboUltimoDeposito, setReciboUltimoDeposito] = useState('')
  const [reciboBanco, setReciboBanco] = useState('')
  const [reciboCbu, setReciboCbu] = useState('')
  const [reciboLugarPago, setReciboLugarPago] = useState('')

  const now = new Date()
  const [mesIdx, setMesIdx] = useState(now.getMonth())
  const [anio, setAnio] = useState(now.getFullYear())

  const [fechaIngreso, setFechaIngreso] = useState('')
  const [antiguedadDesdeFecha, setAntiguedadDesdeFecha] = useState(true)
  const [aniosAntiguedadManual, setAniosAntiguedadManual] = useState(0)
  const [pctAntiguedadAnual, setPctAntiguedadAnual] = useState(2)
  const [horasNormalesMes, setHorasNormalesMes] = useState(200)
  const [horasExtra50, setHorasExtra50] = useState(0)
  const [horasExtra100, setHorasExtra100] = useState(0)

  const [suterhEscalaId, setSuterhEscalaId] = useState('')
  const [uthgraEscalaId, setUthgraEscalaId] = useState('')
  const [importeSumaFijaRem, setImporteSumaFijaRem] = useState(
    SUTERH_SUMA_FIJA_REMUNERATIVA_REF,
  )
  const [bonoConEscalaSuterh, setBonoConEscalaSuterh] = useState(false)
  const [unidadesRetiroResiduos, setUnidadesRetiroResiduos] = useState(1)
  const [planillaCache, setPlanillaCache] = useState<PlanillaCacheV1 | null>(
    () => loadPlanillaCache(),
  )
  const [planillaBusy, setPlanillaBusy] = useState(false)
  const [planillaError, setPlanillaError] = useState<string | null>(null)
  const [planillaPaste, setPlanillaPaste] = useState('')

  const [haberes, setHaberes] = useState<MoneyLine[]>(defaultHaberes)
  const [descuentos, setDescuentos] = useState<MoneyLine[]>(defaultDescuentos)

  const resetEncargadoForm = useCallback(() => {
    setEmpleadoNombre('')
    setEmpleadoCuil('')
    setEmpleadoCategoria('Encargado de edificio / consorcio')
    setFechaIngreso('')
    setAntiguedadDesdeFecha(true)
    setAniosAntiguedadManual(0)
    setPctAntiguedadAnual(2)
    setHorasNormalesMes(200)
    setHorasExtra50(0)
    setHorasExtra100(0)
    setSuterhEscalaId('')
    setUthgraEscalaId('')
    setImporteSumaFijaRem(SUTERH_SUMA_FIJA_REMUNERATIVA_REF)
    setBonoConEscalaSuterh(false)
    setReciboLegajo('')
    setReciboObraSocial('')
    setReciboTipoContrato('Por tiempo indeterminado')
    setReciboTareaDesempeniada('')
    setReciboAntiguedadReconocida('')
    setReciboUltimoDeposito('')
    setReciboBanco('')
    setReciboCbu('')
    setReciboLugarPago('')
    setHaberes(cloneMoneyLines(defaultHaberes))
    setDescuentos(cloneMoneyLines(defaultDescuentos))
  }, [])

  const applyEncargadoSnapshot = useCallback((e: StoredEncargado) => {
    setEmpleadoNombre(e.nombre)
    setEmpleadoCuil(e.cuil)
    setEmpleadoCategoria(e.categoria)
    setFechaIngreso(e.fechaIngreso)
    setAntiguedadDesdeFecha(e.antiguedadDesdeFecha)
    setAniosAntiguedadManual(e.aniosAntiguedadManual)
    setPctAntiguedadAnual(e.pctAntiguedadAnual)
    setHorasNormalesMes(e.horasNormalesMes)
    setHorasExtra50(e.horasExtra50)
    setHorasExtra100(e.horasExtra100)
    setSuterhEscalaId(e.suterhEscalaId)
    setUthgraEscalaId(e.uthgraEscalaId)
    setImporteSumaFijaRem(e.importeSumaFijaRem)
    setBonoConEscalaSuterh(e.bonoConEscalaSuterh)
    setReciboLegajo(e.reciboLegajo ?? '')
    setReciboObraSocial(e.reciboObraSocial ?? '')
    setReciboTipoContrato(
      e.reciboTipoContrato?.trim()
        ? e.reciboTipoContrato
        : 'Por tiempo indeterminado',
    )
    setReciboTareaDesempeniada(e.reciboTareaDesempeniada ?? '')
    setReciboAntiguedadReconocida(e.reciboAntiguedadReconocida ?? '')
    setReciboUltimoDeposito(e.reciboUltimoDeposito ?? '')
    setReciboBanco(e.reciboBanco ?? '')
    setReciboCbu(e.reciboCbu ?? '')
    setReciboLugarPago(e.reciboLugarPago ?? '')
    setHaberes(
      e.haberes?.length
        ? cloneMoneyLines(e.haberes)
        : cloneMoneyLines(defaultHaberes),
    )
    setDescuentos(
      e.descuentos?.length
        ? cloneMoneyLines(e.descuentos)
        : cloneMoneyLines(defaultDescuentos),
    )
  }, [])

  function guardarEnAgenda() {
    const nCons = consorcioNombre.trim()
    const nEmp = empleadoNombre.trim()
    if (!nCons) {
      window.alert('Completá el nombre del consorcio para guardarlo.')
      return
    }
    if (!nEmp) {
      window.alert('Completá el nombre del encargado para guardarlo.')
      return
    }

    const consorcioAgenda = selectedConsorcioId
      ? findConsorcio(agenda, selectedConsorcioId)
      : undefined
    const encargadoPrevio =
      consorcioAgenda && selectedEncargadoId
        ? findEncargado(consorcioAgenda, selectedEncargadoId)
        : undefined
    const encId = resolverIdEncargadoAlGuardar(
      selectedEncargadoId,
      encargadoPrevio,
      empleadoNombre,
      empleadoCuil,
    )

    const enc: StoredEncargado = {
      id: encId,
      nombre: empleadoNombre,
      cuil: empleadoCuil,
      categoria: empleadoCategoria,
      fechaIngreso,
      antiguedadDesdeFecha,
      aniosAntiguedadManual,
      pctAntiguedadAnual,
      horasNormalesMes,
      horasExtra50,
      horasExtra100,
      suterhEscalaId,
      uthgraEscalaId,
      importeSumaFijaRem,
      bonoConEscalaSuterh,
      reciboLegajo,
      reciboObraSocial,
      reciboTipoContrato,
      reciboTareaDesempeniada,
      reciboAntiguedadReconocida,
      reciboUltimoDeposito,
      reciboBanco,
      reciboCbu,
      reciboLugarPago,
      haberes: haberes.map(({ id, concepto, importe, unidad }) => ({
        id,
        concepto,
        importe,
        ...(unidad?.trim() ? { unidad: unidad.trim() } : {}),
      })),
      descuentos: descuentos.map(({ id, concepto, importe, unidad }) => ({
        id,
        concepto,
        importe,
        ...(unidad?.trim() ? { unidad: unidad.trim() } : {}),
      })),
    }

    const consorcios = [...agenda.consorcios]
    let outConsorcioId: string

    if (selectedConsorcioId && findConsorcio(agenda, selectedConsorcioId)) {
      const i = consorcios.findIndex((c) => c.id === selectedConsorcioId)
      const c = consorcios[i]
      const encargados = [...c.encargados]
      const ei = encargados.findIndex((e) => e.id === encId)
      if (ei >= 0) encargados[ei] = enc
      else encargados.push(enc)
      consorcios[i] = {
        ...c,
        nombre: consorcioNombre,
        cuit: consorcioCuit,
        domicilio: consorcioDomicilio,
        encargados,
      }
      outConsorcioId = c.id
    } else {
      outConsorcioId = crypto.randomUUID()
      consorcios.push({
        id: outConsorcioId,
        nombre: consorcioNombre,
        cuit: consorcioCuit,
        domicilio: consorcioDomicilio,
        encargados: [enc],
      })
    }

    const next: AgendaState = { version: 1, consorcios }
    persistAgenda(next)
    setAgenda(next)
    setSelectedConsorcioId(outConsorcioId)
    setSelectedEncargadoId(encId)
  }

  function eliminarConsorcioGuardado() {
    if (!selectedConsorcioId) {
      window.alert('Elegí un consorcio guardado para eliminarlo.')
      return
    }
    if (
      !window.confirm(
        '¿Eliminar este consorcio y todos los encargados guardados dentro?',
      )
    ) {
      return
    }
    const consorcios = agenda.consorcios.filter(
      (c) => c.id !== selectedConsorcioId,
    )
    const next: AgendaState = { version: 1, consorcios }
    persistAgenda(next)
    setAgenda(next)
    setSelectedConsorcioId(null)
    setSelectedEncargadoId(null)
    setConsorcioNombre('')
    setConsorcioCuit('')
    setConsorcioDomicilio('')
    resetEncargadoForm()
  }

  function eliminarEncargadoGuardado() {
    if (!selectedConsorcioId || !selectedEncargadoId) {
      window.alert('Elegí un encargado guardado para eliminarlo.')
      return
    }
    if (!window.confirm('¿Eliminar este encargado de la agenda?')) return
    const consorcios = agenda.consorcios.map((c) => {
      if (c.id !== selectedConsorcioId) return c
      return {
        ...c,
        encargados: c.encargados.filter((e) => e.id !== selectedEncargadoId),
      }
    })
    const next: AgendaState = { version: 1, consorcios }
    persistAgenda(next)
    setAgenda(next)
    const c = findConsorcio(next, selectedConsorcioId)
    if (c && c.encargados.length > 0) {
      const e0 = c.encargados[0]
      setSelectedEncargadoId(e0.id)
      applyEncargadoSnapshot(e0)
    } else {
      setSelectedEncargadoId(null)
      resetEncargadoForm()
    }
  }

  function onConsorcioAgendaChange(id: string) {
    if (!id) {
      setSelectedConsorcioId(null)
      setSelectedEncargadoId(null)
      return
    }
    const c = findConsorcio(agenda, id)
    if (!c) return
    setSelectedConsorcioId(c.id)
    setConsorcioNombre(c.nombre)
    setConsorcioCuit(c.cuit)
    setConsorcioDomicilio(c.domicilio)
    if (c.encargados.length > 0) {
      const e0 = c.encargados[0]
      setSelectedEncargadoId(e0.id)
      applyEncargadoSnapshot(e0)
    } else {
      setSelectedEncargadoId(null)
      resetEncargadoForm()
    }
  }

  function onEncargadoAgendaChange(id: string) {
    if (!selectedConsorcioId) return
    const c = findConsorcio(agenda, selectedConsorcioId)
    if (!c) return
    if (!id) {
      setSelectedEncargadoId(null)
      resetEncargadoForm()
      return
    }
    const e = findEncargado(c, id)
    if (!e) return
    setSelectedEncargadoId(e.id)
    applyEncargadoSnapshot(e)
  }

  const consorcioSeleccionado = selectedConsorcioId
    ? findConsorcio(agenda, selectedConsorcioId)
    : undefined

  const consorciosOrdenados = useMemo(
    () =>
      [...agenda.consorcios].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
      ),
    [agenda.consorcios],
  )

  const encargadosOrdenados = useMemo(() => {
    if (!consorcioSeleccionado) return []
    return [...consorcioSeleccionado.encargados].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
    )
  }, [consorcioSeleccionado])

  const adicionalesEfectivos = useMemo(
    () =>
      mergeAdicionalesPlanilla(
        SUTERH_ADICIONALES_PLANILLA,
        planillaCache?.overrides,
      ),
    [planillaCache],
  )

  const totalHaberes = useMemo(
    () => roundMoney(haberes.reduce((s, l) => s + l.importe, 0)),
    [haberes],
  )
  const totalDescuentos = useMemo(
    () => roundMoney(descuentos.reduce((s, l) => s + l.importe, 0)),
    [descuentos],
  )
  const neto = roundMoney(totalHaberes - totalDescuentos)

  const finPeriodo = useMemo(() => finDePeriodo(anio, mesIdx), [anio, mesIdx])

  const aniosAntiguedadEfectivos = useMemo(() => {
    if (antiguedadDesdeFecha && fechaIngreso) {
      return aniosCompletosDesde(fechaIngreso, finPeriodo)
    }
    return Math.max(0, aniosAntiguedadManual)
  }, [antiguedadDesdeFecha, fechaIngreso, finPeriodo, aniosAntiguedadManual])

  const basicoMensual = basicoDesdeHaberes(haberes)

  const preview = useMemo(() => {
    const base = basicoMensual
    const ant = roundMoney(base * (pctAntiguedadAnual / 100) * aniosAntiguedadEfectivos)
    const horasMes = Math.max(1, horasNormalesMes)
    const valorHora = roundMoney(base / horasMes)
    const he50 = roundMoney(valorHora * 1.5 * horasExtra50)
    const he100 = roundMoney(valorHora * 2 * horasExtra100)
    return { ant, valorHora, he50, he100 }
  }, [
    basicoMensual,
    pctAntiguedadAnual,
    aniosAntiguedadEfectivos,
    horasNormalesMes,
    horasExtra50,
    horasExtra100,
  ])

  const uthgraSeleccion = useMemo(
    () => UTHGRA_CCT401_PUBLICOS.find((r) => r.id === uthgraEscalaId),
    [uthgraEscalaId],
  )

  function agregarLineaAdicionalPlanilla(def: SuterhAdicionalPlanilla) {
    const sufijo = planillaCache
      ? ` — ref. planilla FATERYH (${new Date(planillaCache.fetchedAt).toLocaleDateString('es-AR')})`
      : ' — ref. planilla FATERYH (valores del programa)'
    if (def.kind === 'fijo') {
      setHaberes((rows) => [
        ...rows,
        newLine({
          concepto: `${def.concepto}${sufijo}`,
          importe: roundMoney(def.importe),
        }),
      ])
      return
    }
    if (def.kind === 'pct_basico') {
      const b = basicoMensual
      if (b <= 0) {
        window.alert(
          'Cargá primero el sueldo básico en la primera línea de haberes (o elegí una escala SUTERH).',
        )
        return
      }
      const imp = roundMoney((b * def.porcentaje) / 100)
      setHaberes((rows) => [
        ...rows,
        newLine({
          concepto: `${def.concepto} (${def.porcentaje}% s/ básico)${sufijo}`,
          importe: imp,
        }),
      ])
      return
    }
    const u = Math.max(1, Math.floor(unidadesRetiroResiduos) || 1)
    const imp = roundMoney(def.importePorUnidad * u)
    const concepto =
      u === 1
        ? `${def.concepto}${sufijo}`
        : `${def.concepto} (× ${u} u.)${sufijo}`
    setHaberes((rows) => [...rows, newLine({ concepto, importe: imp })])
  }

  async function actualizarPlanillaDesdeFateryh() {
    setPlanillaBusy(true)
    setPlanillaError(null)
    try {
      const url = resolvePlanillaFetchUrl()
      const res = await fetch(url, { credentials: 'omit', cache: 'no-store' })
      if (!res.ok) throw new Error(`Respuesta HTTP ${res.status}`)
      const html = await res.text()
      const parsed = parsePlanillaFateryhHtml(html)
      if (Object.keys(parsed.overrides).length === 0) {
        throw new Error(
          'No se encontró la tabla de adicionales. Si la página cambió, usá «Pegar HTML».',
        )
      }
      const cache = buildPlanillaCacheFromParsed(parsed)
      savePlanillaCache(cache)
      setPlanillaCache(cache)
    } catch (e) {
      const base = e instanceof Error ? e.message : 'No se pudo descargar la planilla'
      const corsHint =
        import.meta.env.PROD && !import.meta.env.VITE_FATERYH_PLANILLA_PROXY
          ? ' En sitio publicado suele bloquear el navegador (CORS): usá «Pegar HTML» o un proxy (variable VITE_FATERYH_PLANILLA_PROXY).'
          : ''
      setPlanillaError(base + corsHint)
    } finally {
      setPlanillaBusy(false)
    }
  }

  function importarPlanillaDesdePegado() {
    const html = planillaPaste.trim()
    if (!html) {
      window.alert('Pegá primero el código de la página de la planilla (Ctrl+U o «Ver código fuente»).')
      return
    }
    setPlanillaError(null)
    const parsed = parsePlanillaFateryhHtml(html)
    if (Object.keys(parsed.overrides).length === 0) {
      window.alert(
        'No se encontró la tabla de adicionales en el HTML pegado.',
      )
      return
    }
    const cache = buildPlanillaCacheFromParsed(parsed)
    savePlanillaCache(cache)
    setPlanillaCache(cache)
    setPlanillaPaste('')
  }

  function restaurarValoresEmpaquetadosAdicionales() {
    clearPlanillaCache()
    setPlanillaCache(null)
    setPlanillaError(null)
  }

  function aplicarSumaFijaDetectada() {
    const v = planillaCache?.sumaFijaRemuneratoriaRef
    if (v == null || v <= 0) return
    setImporteSumaFijaRem(v)
  }

  function updateHaber(id: string, patch: Partial<MoneyLine>) {
    setHaberes((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    )
  }

  function updateDescuento(id: string, patch: Partial<MoneyLine>) {
    setDescuentos((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    )
  }

  function aplicarRetencionesSobreBruto() {
    const bruto = totalHaberes
    if (bruto <= 0) return
    const jub = roundMoney(bruto * 0.11)
    const pami = roundMoney(bruto * 0.03)
    const os = roundMoney(bruto * 0.03)
    setDescuentos((rows) => {
      const byConcept = (c: string) => rows.find((r) => r.concepto === c)
      const rest = rows.filter(
        (r) =>
          ![
            'Jubilación (aportes)',
            'PAMI / Ley 19.032',
            'Obra social',
          ].includes(r.concepto),
      )
      const merged: MoneyLine[] = []
      const pushOrNew = (concepto: string, importe: number) => {
        const ex = byConcept(concepto)
        merged.push(
          ex ? { ...ex, importe } : newLine({ concepto, importe }),
        )
      }
      pushOrNew('Jubilación (aportes)', jub)
      pushOrNew('PAMI / Ley 19.032', pami)
      pushOrNew('Obra social', os)
      return [...merged, ...rest]
    })
  }

  const aplicarEscalaSuterh = useCallback(
    (id: string) => {
      setSuterhEscalaId(id)
      setUthgraEscalaId('')
      const row = SUTERH_ENCARGADO_PERMANENTE.find((r) => r.id === id)
      if (!row) return
      setEmpleadoCategoria(row.label)
      setHaberes((h) => {
        let next = ensureFirstBasico(h, row.basicoMensual)
        if (bonoConEscalaSuterh && importeSumaFijaRem > 0) {
          next = incorporarSumaFijaEnHaberes(next, importeSumaFijaRem)
        }
        return next
      })
    },
    [bonoConEscalaSuterh, importeSumaFijaRem],
  )

  const aplicarEscalaUthgra = useCallback((id: string) => {
    setUthgraEscalaId(id)
    setSuterhEscalaId('')
    const row = UTHGRA_CCT401_PUBLICOS.find((r) => r.id === id)
    if (!row) return
    setEmpleadoCategoria(`${row.label} (${UTHGRA_401_META.nombre})`)
    setHaberes((h) => {
      const sinBonoSuterh = h.filter((r) => r.concepto !== CONCEPTO_SUMA_FIJA_REM)
      return ensureFirstBasico(sinBonoSuterh, row.basicoMarzo2026)
    })
  }, [])

  function aplicarSumaFijaRemunerativaAlRecibo() {
    setHaberes((h) => incorporarSumaFijaEnHaberes(h, importeSumaFijaRem))
  }

  function incorporarAntiguedadYExtras() {
    const base = basicoMensual
    if (base <= 0) return

    const ant = preview.ant
    const m50 = preview.he50
    const m100 = preview.he100

    setHaberes((rows) => {
      const filtradas = rows.filter(
        (r) =>
          ![
            CONCEPTO_ANTIGUEDAD,
            CONCEPTO_HE50,
            CONCEPTO_HE100,
          ].includes(r.concepto),
      )
      const add: MoneyLine[] = []
      if (ant > 0) add.push(newLine({ concepto: CONCEPTO_ANTIGUEDAD, importe: ant }))
      if (m50 > 0) add.push(newLine({ concepto: CONCEPTO_HE50, importe: m50 }))
      if (m100 > 0) add.push(newLine({ concepto: CONCEPTO_HE100, importe: m100 }))
      return [...filtradas, ...add]
    })
  }

  async function handleDescargarPdf() {
    const el = reciboRef.current
    if (!el) return
    el.classList.add('pdf-snapshot')
    setPdfBusy(true)
    try {
      const base = [
        'recibo',
        empleadoNombre || 'empleado',
        `${MESES[mesIdx]}-${anio}`,
      ].join('-')
      await exportElementToPdf(el, base)
    } finally {
      el.classList.remove('pdf-snapshot')
      setPdfBusy(false)
    }
  }

  const periodoLabel = `${MESES[mesIdx]} ${anio}`
  const periodoPagoCorto = `${String(mesIdx + 1).padStart(2, '0')}/${anio}`
  const cctRecibo =
    uthgraEscalaId && !suterhEscalaId
      ? `${UTHGRA_401_META.nombre} (referencia)`
      : SUTERH_META.cct
  const totalNoRemunerativo = 0

  return (
    <div className="app">
      <header className="app-header no-print">
        <div>
          <h1>Resumen de sueldo</h1>
          <p className="subtitle">
            Encargado de consorcio — liquidación y recibo en pesos argentinos
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn"
            disabled={pdfBusy}
            onClick={() => void handleDescargarPdf()}
          >
            {pdfBusy ? 'Generando PDF…' : 'Descargar PDF'}
          </button>
          <button type="button" className="btn primary" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </header>

      <div className="layout">
        <section className="panel editor no-print" aria-label="Datos de liquidación">
          <h2>Agenda guardada</h2>
          <p className="hint">
            Los datos se guardan en este navegador (local). Elegí un consorcio y un
            encargado para cargar todo de una vez, o completá el formulario y pulsá
            guardar para actualizar la ficha. Para dar de alta otro encargado en el
            mismo consorcio usá «Agregar otro encargado» o cambiá nombre/CUIL
            respecto de la ficha cargada: se guardará como persona nueva sin pisar la
            anterior.
          </p>
          <div className="field-grid agenda-picker">
            <label className="field span-2">
              <span>Consorcio</span>
              <select
                value={selectedConsorcioId ?? ''}
                onChange={(e) => onConsorcioAgendaChange(e.target.value)}
              >
                <option value="">— Sin seleccionar (entrada libre) —</option>
                {consorciosOrdenados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre || '(sin nombre)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span>Encargado</span>
              <select
                value={selectedEncargadoId ?? ''}
                disabled={!selectedConsorcioId}
                onChange={(e) => onEncargadoAgendaChange(e.target.value)}
              >
                <option value="">
                  {selectedConsorcioId
                    ? '— Nuevo encargado en este consorcio —'
                    : '— Elegí un consorcio primero —'}
                </option>
                {encargadosOrdenados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre || '(sin nombre)'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row-actions agenda-actions">
            <button type="button" className="btn primary" onClick={guardarEnAgenda}>
              Guardar consorcio y encargado
            </button>
            <button
              type="button"
              className="btn subtle"
              disabled={!selectedConsorcioId}
              onClick={() => {
                setSelectedEncargadoId(null)
                resetEncargadoForm()
              }}
              title="Limpia el encargado y el próximo guardado agrega una ficha nueva en este consorcio"
            >
              Agregar otro encargado
            </button>
            <button
              type="button"
              className="btn subtle"
              disabled={!selectedEncargadoId}
              onClick={eliminarEncargadoGuardado}
            >
              Quitar encargado
            </button>
            <button
              type="button"
              className="btn subtle danger"
              disabled={!selectedConsorcioId}
              onClick={eliminarConsorcioGuardado}
            >
              Quitar consorcio
            </button>
          </div>

          <h2>Datos del consorcio</h2>
          <div className="field-grid">
            <label className="field">
              <span>Nombre del consorcio / edificio</span>
              <input
                value={consorcioNombre}
                onChange={(e) => setConsorcioNombre(e.target.value)}
                placeholder="Ej. Consorcio Av. Corrientes 1234"
              />
            </label>
            <label className="field">
              <span>CUIT del consorcio</span>
              <input
                value={consorcioCuit}
                onChange={(e) => setConsorcioCuit(e.target.value)}
                placeholder="20-12345678-9"
              />
            </label>
            <label className="field span-2">
              <span>Domicilio laboral</span>
              <input
                value={consorcioDomicilio}
                onChange={(e) => setConsorcioDomicilio(e.target.value)}
              />
            </label>
          </div>

          <h2>Encargado</h2>
          <div className="field-grid">
            <label className="field">
              <span>Nombre y apellido</span>
              <input
                value={empleadoNombre}
                onChange={(e) => setEmpleadoNombre(e.target.value)}
              />
            </label>
            <label className="field">
              <span>CUIL</span>
              <input
                value={empleadoCuil}
                onChange={(e) => setEmpleadoCuil(e.target.value)}
                placeholder="20-12345678-1"
              />
            </label>
            <label className="field span-2">
              <span>Categoría / puesto</span>
              <input
                value={empleadoCategoria}
                onChange={(e) => setEmpleadoCategoria(e.target.value)}
              />
            </label>
          </div>

          <h2>Recibo Ley 20.744 (modelo art. 140 LCT)</h2>
          <p className="hint">
            Completá lo que figure en la liquidación oficial. En «Un.» (haberes y
            descuentos) podés cargar días, porcentajes, etc.; si el primer concepto
            queda vacío, el recibo muestra 30 como jornales del mes.
          </p>
          <div className="field-grid">
            <label className="field">
              <span>Legajo Nº</span>
              <input
                value={reciboLegajo}
                onChange={(e) => setReciboLegajo(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="field">
              <span>Obra social</span>
              <input
                value={reciboObraSocial}
                onChange={(e) => setReciboObraSocial(e.target.value)}
                placeholder="Ej. OSECAC"
              />
            </label>
            <label className="field span-2">
              <span>Tipo de contrato</span>
              <input
                value={reciboTipoContrato}
                onChange={(e) => setReciboTipoContrato(e.target.value)}
              />
            </label>
            <label className="field span-2">
              <span>Tarea desempeñada</span>
              <input
                value={reciboTareaDesempeniada}
                onChange={(e) => setReciboTareaDesempeniada(e.target.value)}
                placeholder="Ej. Encargado de edificio"
              />
            </label>
            <label className="field">
              <span>Antigüedad reconocida (fecha)</span>
              <input
                type="date"
                value={reciboAntiguedadReconocida}
                onChange={(e) => setReciboAntiguedadReconocida(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Último depósito (fecha)</span>
              <input
                type="date"
                value={reciboUltimoDeposito}
                onChange={(e) => setReciboUltimoDeposito(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Banco / acreditación</span>
              <input
                value={reciboBanco}
                onChange={(e) => setReciboBanco(e.target.value)}
              />
            </label>
            <label className="field">
              <span>CBU</span>
              <input
                value={reciboCbu}
                onChange={(e) => setReciboCbu(e.target.value)}
                placeholder="22 dígitos"
              />
            </label>
            <label className="field span-2">
              <span>Lugar de pago (pie de recibo)</span>
              <input
                value={reciboLugarPago}
                onChange={(e) => setReciboLugarPago(e.target.value)}
                placeholder="Ciudad — local / consorcio"
              />
            </label>
          </div>

          <h2>Escalas de referencia</h2>
          <div className="convenio-block">
            <p className="convenio-title">{SUTERH_META.nombre}</p>
            <p className="convenio-meta">
              {SUTERH_META.cct}. {SUTERH_META.nota}
            </p>
            <label className="field span-2">
              <span>Encargado permanente (referencia prensa mar. 2026)</span>
              <select
                value={suterhEscalaId}
                onChange={(e) => {
                  const v = e.target.value
                  if (v) aplicarEscalaSuterh(v)
                  else setSuterhEscalaId('')
                }}
              >
                <option value="">— Elegí categoría para cargar el básico —</option>
                {SUTERH_ENCARGADO_PERMANENTE.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} — {formatArs(r.basicoMensual)}
                  </option>
                ))}
              </select>
            </label>
            <p className="bono-hint">
              Suma fija remunerativa (referencia inicio 2026:{' '}
              {formatArs(SUTERH_SUMA_FIJA_REMUNERATIVA_REF)}). En el convenio puede
              abonarse en forma proporcional según categoría: editá el importe y
              cargalo al recibo.
            </p>
            <label className="field bono-importe">
              <span>Importe suma fija remunerativa</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={importeSumaFijaRem || ''}
                onChange={(e) =>
                  setImporteSumaFijaRem(Number.parseFloat(e.target.value) || 0)
                }
              />
            </label>
            <div className="row-actions bono-actions">
              <button
                type="button"
                className="btn subtle"
                onClick={() =>
                  setImporteSumaFijaRem(SUTERH_SUMA_FIJA_REMUNERATIVA_REF)
                }
              >
                Usar referencia {formatArs(SUTERH_SUMA_FIJA_REMUNERATIVA_REF)}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={aplicarSumaFijaRemunerativaAlRecibo}
              >
                Agregar o actualizar en haberes
              </button>
            </div>
            <label className="field check span-2">
              <input
                type="checkbox"
                checked={bonoConEscalaSuterh}
                onChange={(e) => setBonoConEscalaSuterh(e.target.checked)}
              />
              <span>
                Incluir automáticamente al elegir una escala SUTERH (mismo importe
                de arriba)
              </span>
            </label>

            <div className="adicionales-planilla">
              <p className="adicionales-planilla-title">
                Adicionales (planilla vigente)
              </p>
              <p className="bono-hint">
                Referencia según la{' '}
                <a
                  href={SUTERH_PLANILLA_FATERYH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  planilla salarial FATERYH
                </a>
                . Los importes pueden{' '}
                <strong>actualizarse desde la web</strong> y quedan guardados en
                este navegador. Con <code>npm run dev</code> la descarga usa un
                proxy local; en la versión publicada, si falla por CORS, pegá el
                HTML de la página abajo. El adicional global de la planilla lo
                podés aplicar al campo «suma fija remunerativa» si lo detectamos.
                Los ítems porcentuales usan el básico de la primera línea de
                haberes.
              </p>
              <div className="planilla-toolbar row-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={planillaBusy}
                  onClick={() => void actualizarPlanillaDesdeFateryh()}
                >
                  {planillaBusy ? 'Descargando…' : 'Actualizar desde FATERYH'}
                </button>
                <button
                  type="button"
                  className="btn subtle"
                  disabled={
                    planillaCache?.sumaFijaRemuneratoriaRef == null ||
                    planillaCache.sumaFijaRemuneratoriaRef <= 0
                  }
                  onClick={aplicarSumaFijaDetectada}
                  title="Copia al campo «Importe suma fija remunerativa» el monto leído en la planilla"
                >
                  Aplicar adicional global detectado (
                  {planillaCache?.sumaFijaRemuneratoriaRef != null &&
                  planillaCache.sumaFijaRemuneratoriaRef > 0
                    ? formatArs(planillaCache.sumaFijaRemuneratoriaRef)
                    : '—'}
                  )
                </button>
                <button
                  type="button"
                  className="btn subtle"
                  onClick={restaurarValoresEmpaquetadosAdicionales}
                  disabled={!planillaCache}
                >
                  Usar solo valores del programa
                </button>
              </div>
              {planillaCache ? (
                <p className="planilla-cache-meta">
                  Valores locales: actualizado{' '}
                  {new Date(planillaCache.fetchedAt).toLocaleString('es-AR')}
                </p>
              ) : (
                <p className="planilla-cache-meta planilla-cache-meta--default">
                  Sin datos descargados: se muestran los valores incluidos en el
                  programa.
                </p>
              )}
              {planillaError ? (
                <p className="planilla-error" role="alert">
                  {planillaError}
                </p>
              ) : null}
              <details className="planilla-paste-fallback">
                <summary>Importar pegando el HTML de la página</summary>
                <p className="bono-hint">
                  En la planilla FATERYH: menú del navegador → «Ver código fuente de
                  la página» o guardar la página como HTML, abrila en un editor,
                  copiá todo y pegalo acá.
                </p>
                <textarea
                  className="planilla-paste-textarea"
                  rows={5}
                  value={planillaPaste}
                  onChange={(e) => setPlanillaPaste(e.target.value)}
                  placeholder="Pegá aquí el HTML completo…"
                />
                <button
                  type="button"
                  className="btn subtle"
                  onClick={importarPlanillaDesdePegado}
                >
                  Procesar HTML pegado
                </button>
              </details>
              <div className="adicionales-planilla-list" role="list">
                {adicionalesEfectivos.map((def) => (
                  <div
                    key={def.id}
                    className="adicional-planilla-row"
                    role="listitem"
                  >
                    <span className="adic-label">{def.concepto}</span>
                    <span className="adic-meta">
                      {def.kind === 'fijo' ? formatArs(def.importe) : null}
                      {def.kind === 'pct_basico' ? (
                        <>
                          {def.porcentaje}% s/ básico
                          {basicoMensual > 0
                            ? ` → ${formatArs(
                                roundMoney(
                                  (basicoMensual * def.porcentaje) / 100,
                                ),
                              )}`
                            : ' (sin básico cargado)'}
                        </>
                      ) : null}
                      {def.kind === 'por_unidad' ? (
                        <>
                          {formatArs(def.importePorUnidad)} ×{' '}
                          <label className="adic-unidades-wrap">
                            <input
                              type="number"
                              className="adic-unidades"
                              min={1}
                              step={1}
                              value={unidadesRetiroResiduos}
                              onChange={(e) =>
                                setUnidadesRetiroResiduos(
                                  Math.max(
                                    1,
                                    Number.parseInt(e.target.value, 10) || 1,
                                  ),
                                )
                              }
                              aria-label="Unidades (retiro de residuos)"
                            />{' '}
                            u.
                          </label>
                        </>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="btn subtle adic-add-btn"
                      onClick={() => agregarLineaAdicionalPlanilla(def)}
                    >
                      Agregar al recibo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="convenio-block uthgra">
            <p className="convenio-title">{UTHGRA_401_META.nombre}</p>
            <p className="convenio-meta">
              {UTHGRA_401_META.anexo}. {UTHGRA_401_META.nota}
            </p>
            <label className="field span-2">
              <span>Categoría comedores públicos CCT 401/05 (referencia)</span>
              <select
                value={uthgraEscalaId}
                onChange={(e) => {
                  const v = e.target.value
                  if (v) aplicarEscalaUthgra(v)
                  else setUthgraEscalaId('')
                }}
              >
                <option value="">— No aplica a encargados SUTERH —</option>
                {UTHGRA_CCT401_PUBLICOS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} — básico {formatArs(r.basicoMarzo2026)}
                  </option>
                ))}
              </select>
            </label>
            {uthgraSeleccion ? (
              <p className="uthgra-snr">
                SNR referencia marzo 2026:{' '}
                <strong>{formatArs(uthgraSeleccion.snrMarzo2026)}</strong> (suele
                abonarse aparte; ver homologación).
              </p>
            ) : null}
          </div>

          <h2>Período</h2>
          <div className="field-grid periodo">
            <label className="field">
              <span>Mes</span>
              <select
                value={mesIdx}
                onChange={(e) => setMesIdx(Number(e.target.value))}
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Año</span>
              <input
                type="number"
                min={2000}
                max={2100}
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
              />
            </label>
          </div>

          <h2>Antigüedad</h2>
          <p className="hint">
            Base de cálculo: importe de la{' '}
            <strong>primera línea de haberes</strong> (sueldo básico mensual). El
            porcentaje por año suele ser 2% en el convenio de encargados; ajustalo
            según categoría y acta vigente.
          </p>
          <div className="field-grid">
            <label className="field span-2">
              <span>Fecha de ingreso</span>
              <input
                type="date"
                value={fechaIngreso}
                onChange={(e) => setFechaIngreso(e.target.value)}
              />
            </label>
            <label className="field check span-2">
              <input
                type="checkbox"
                checked={antiguedadDesdeFecha}
                onChange={(e) => setAntiguedadDesdeFecha(e.target.checked)}
              />
              <span>Calcular años de antigüedad desde la fecha de ingreso al cierre del período ({periodoLabel})</span>
            </label>
            {!antiguedadDesdeFecha ? (
              <label className="field">
                <span>Años de antigüedad (manual)</span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  step={1}
                  value={aniosAntiguedadManual}
                  onChange={(e) => setAniosAntiguedadManual(Number(e.target.value))}
                />
              </label>
            ) : null}
            <label className="field">
              <span>% por año sobre el básico</span>
              <input
                type="number"
                min={0}
                max={50}
                step={0.25}
                value={pctAntiguedadAnual}
                onChange={(e) => setPctAntiguedadAnual(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="preview-line">
            Años considerados: <strong>{aniosAntiguedadEfectivos}</strong> — Antigüedad
            estimada: <strong>{formatArs(preview.ant)}</strong>
          </p>

          <h2>Horas extras</h2>
          <p className="hint">
            Valor hora ordinaria = básico mensual ÷ horas normales del mes (por
            defecto 200 hs). Extra al 50%: 1,5×; al 100%: 2×.
          </p>
          <div className="field-grid">
            <label className="field">
              <span>Horas normales del mes (divisor)</span>
              <input
                type="number"
                min={1}
                max={400}
                step={1}
                value={horasNormalesMes}
                onChange={(e) => setHorasNormalesMes(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Valor hora (calculado)</span>
              <input readOnly value={formatArs(preview.valorHora)} />
            </label>
            <label className="field">
              <span>Cantidad de horas extra al 50%</span>
              <input
                type="number"
                min={0}
                max={999}
                step={0.5}
                value={horasExtra50 || ''}
                onChange={(e) =>
                  setHorasExtra50(Number.parseFloat(e.target.value) || 0)
                }
              />
            </label>
            <label className="field">
              <span>Cantidad de horas extra al 100%</span>
              <input
                type="number"
                min={0}
                max={999}
                step={0.5}
                value={horasExtra100 || ''}
                onChange={(e) =>
                  setHorasExtra100(Number.parseFloat(e.target.value) || 0)
                }
              />
            </label>
          </div>
          <p className="preview-line">
            Subtotal HE 50%: <strong>{formatArs(preview.he50)}</strong> — HE 100%:{' '}
            <strong>{formatArs(preview.he100)}</strong>
          </p>
          <button type="button" className="btn primary" onClick={incorporarAntiguedadYExtras}>
            Incorporar antigüedad y horas extras al recibo
          </button>

          <h2>Haberes</h2>
          <p className="hint">
            La primera fila se usa como básico mensual para los cálculos de arriba.
          </p>
          <MoneyLinesEditor
            rows={haberes}
            onChange={setHaberes}
            onUpdate={updateHaber}
            emptyConcept="Concepto"
          />
          <button
            type="button"
            className="btn subtle"
            onClick={() => setHaberes((r) => [...r, newLine()])}
          >
            + Agregar concepto
          </button>

          <h2>Descuentos</h2>
          <p className="hint">
            Podés cargar importes a mano o estimar jubilación 11%, PAMI 3% y obra
            social 3% sobre el total de haberes (valores orientativos; ajustá
            según tu liquidación real).
          </p>
          <MoneyLinesEditor
            rows={descuentos}
            onChange={setDescuentos}
            onUpdate={updateDescuento}
            emptyConcept="Descuento"
          />
          <div className="row-actions">
            <button
              type="button"
              className="btn subtle"
              onClick={() => setDescuentos((r) => [...r, newLine()])}
            >
              + Agregar descuento
            </button>
            <button
              type="button"
              className="btn"
              onClick={aplicarRetencionesSobreBruto}
            >
              Calcular 11% + 3% + 3% sobre haberes
            </button>
          </div>
        </section>

        <section className="recibo-wrap" aria-label="Vista de recibo">
          <article className="recibo recibo-lct" ref={reciboRef}>
            <div className="lct-banner">
              <span className="lct-banner-title">Recibo de haberes — Ley 20.744</span>
              <span className="lct-banner-sub">
                Modelo art. 140 LCT — referencia consorcio / encargado
              </span>
            </div>

            <div className="lct-top-grid">
              <div className="lct-box lct-empleador">
                <div className="lct-box-label">Empleador</div>
                <div className="lct-box-strong">{consorcioNombre || '—'}</div>
                <div>C.U.I.T.: {consorcioCuit || '—'}</div>
                <div>{consorcioDomicilio || '—'}</div>
              </div>
              <div className="lct-box lct-periodo">
                <div className="lct-box-label">Período de pago</div>
                <div className="lct-periodo-val">{periodoLabel.toUpperCase()}</div>
                <div className="lct-original">Original</div>
              </div>
            </div>

            <div className="lct-empleado-grid">
              <div className="lct-cell">
                <span className="lct-lbl">Apellido y nombre</span>
                <span>{empleadoNombre || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">C.U.I.L.</span>
                <span>{empleadoCuil || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Legajo Nº</span>
                <span>{reciboLegajo || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Tipo de contrato</span>
                <span>{reciboTipoContrato || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Obra social</span>
                <span>{reciboObraSocial || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">C.C.T.</span>
                <span>{cctRecibo}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Fecha de ingreso</span>
                <span>{fechaIngreso || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Antig. reconocida</span>
                <span>{reciboAntiguedadReconocida || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Básico</span>
                <span className="lct-num">{formatArs(basicoMensual)}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Categoría</span>
                <span>{empleadoCategoria || '—'}</span>
              </div>
              <div className="lct-cell lct-span-2">
                <span className="lct-lbl">Tarea desempeñada</span>
                <span>{reciboTareaDesempeniada || empleadoCategoria || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Último depósito</span>
                <span>{reciboUltimoDeposito || '—'}</span>
              </div>
              <div className="lct-cell">
                <span className="lct-lbl">Período de pago</span>
                <span>{periodoPagoCorto}</span>
              </div>
              <div className="lct-cell lct-span-2">
                <span className="lct-lbl">Banco</span>
                <span>{reciboBanco || '—'}</span>
              </div>
            </div>

            <table className="lct-main-table">
              <thead>
                <tr>
                  <th className="lct-col-concepto">Conceptos</th>
                  <th className="lct-col-un">Un.</th>
                  <th className="lct-col-num">Remunerativo</th>
                  <th className="lct-col-num">No remunerativo</th>
                  <th className="lct-col-num">Descuentos</th>
                </tr>
              </thead>
              <tbody>
                <tr className="lct-section-row">
                  <td colSpan={5}>Haberes y conceptos remunerativos</td>
                </tr>
                {haberes.map((l, i) => (
                  <tr key={l.id}>
                    <td>{l.concepto || '—'}</td>
                    <td className="lct-col-un">{unidadHaberEnRecibo(l, i)}</td>
                    <td className="lct-col-num">{formatArs(l.importe)}</td>
                    <td className="lct-col-num">—</td>
                    <td className="lct-col-num">—</td>
                  </tr>
                ))}
                <tr className="lct-section-row">
                  <td colSpan={5}>Descuentos</td>
                </tr>
                {descuentos.map((l) => (
                  <tr key={l.id}>
                    <td>{l.concepto || '—'}</td>
                    <td className="lct-col-un">{unidadDescuentoEnRecibo(l)}</td>
                    <td className="lct-col-num">—</td>
                    <td className="lct-col-num">—</td>
                    <td className="lct-col-num">{formatArs(l.importe)}</td>
                  </tr>
                ))}
                <tr className="lct-totales-row">
                  <td colSpan={2}>TOTALES</td>
                  <td className="lct-col-num">{formatArs(totalHaberes)}</td>
                  <td className="lct-col-num">
                    {totalNoRemunerativo > 0
                      ? formatArs(totalNoRemunerativo)
                      : '—'}
                  </td>
                  <td className="lct-col-num">{formatArs(totalDescuentos)}</td>
                </tr>
              </tbody>
            </table>

            <div className="lct-neto-block">
              <div className="lct-neto-label">Neto a cobrar</div>
              <div className="lct-neto-val">{formatArs(neto)}</div>
            </div>
            <p className="lct-letras">{sonPesosEnLetras(neto)}</p>
            <p className="lct-cbu">
              <span className="lct-lbl">CBU</span> {reciboCbu || '—'}
            </p>

            <div className="lct-contrib-head">
              Contribuciones y/o conceptos abonados por el empleador
            </div>
            <div className="lct-contrib-grid">
              <table className="lct-contrib-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Un. (%)</th>
                    <th className="lct-col-num">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {LCT_CONTRIB_IZQ.map((c) => (
                    <tr key={c}>
                      <td>{c}</td>
                      <td>—</td>
                      <td className="lct-col-num">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="lct-contrib-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Un. (%)</th>
                    <th className="lct-col-num">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {LCT_CONTRIB_DER.map((c) => (
                    <tr key={c}>
                      <td>{c}</td>
                      <td>—</td>
                      <td className="lct-col-num">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lct-contrib-foot">
              <span>Total contribuciones y otros conceptos (empleador)</span>
              <span className="lct-col-num">—</span>
            </div>

            <footer className="lct-footer">
              <div className="lct-firma-grid">
                <div>
                  <div className="lct-lbl">Lugar y fecha de pago</div>
                  <div>
                    {reciboLugarPago || consorcioDomicilio || '—'} —{' '}
                    {new Date(anio, mesIdx, 15).toLocaleDateString('es-AR')}
                  </div>
                </div>
                <div className="lct-firma-line">
                  <div className="lct-lbl">Firma del empleado</div>
                  <div className="lct-firma-rule" />
                </div>
              </div>
              <p className="legal lct-legal">
                Recibí conforme la suma indicada en concepto de haberes según la
                presente liquidación, de conformidad con el art. 140 de la Ley de
                Contrato de Trabajo. Documento generado como ayuda al consorcio: los
                importes deben coincidir con la liquidación oficial y actuación
                homologada.
              </p>
            </footer>
          </article>
        </section>
      </div>
    </div>
  )
}

function MoneyLinesEditor({
  rows,
  onChange,
  onUpdate,
  emptyConcept,
}: {
  rows: MoneyLine[]
  onChange: (rows: MoneyLine[]) => void
  onUpdate: (id: string, patch: Partial<MoneyLine>) => void
  emptyConcept: string
}) {
  return (
    <div className="lines-editor">
      {rows.map((row) => (
        <div key={row.id} className="line-row">
          <input
            className="line-concept"
            value={row.concepto}
            onChange={(e) => onUpdate(row.id, { concepto: e.target.value })}
            placeholder={emptyConcept}
            aria-label={`${emptyConcept} ${row.id}`}
          />
          <input
            className="line-unidad"
            value={row.unidad ?? ''}
            onChange={(e) => onUpdate(row.id, { unidad: e.target.value })}
            placeholder="Un."
            title="Unidades, días o % (columna Un. del recibo LCT)"
            aria-label="Unidad"
          />
          <input
            className="line-amount"
            inputMode="decimal"
            value={
              row.importe === 0 ? '' : row.importe.toString().replace('.', ',')
            }
            onChange={(e) => {
              const v = parseArsInput(e.target.value)
              onUpdate(row.id, { importe: v })
            }}
            placeholder="0,00"
            aria-label="Importe"
          />
          <button
            type="button"
            className="btn icon danger"
            title="Quitar línea"
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default App
