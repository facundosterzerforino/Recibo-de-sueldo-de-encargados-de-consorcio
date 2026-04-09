import { useCallback, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  SUTERH_ENCARGADO_PERMANENTE,
  SUTERH_META,
  UTHGRA_401_META,
  UTHGRA_CCT401_PUBLICOS,
} from './convenios'
import { formatArs, parseArsInput, roundMoney } from './money'
import { exportElementToPdf } from './pdfExport'

type MoneyLine = {
  id: string
  concepto: string
  importe: number
}

const CONCEPTO_BASICO_DEFAULT = 'Sueldo básico / jornal mensual'
const CONCEPTO_ANTIGUEDAD = 'Antigüedad (convenio)'
const CONCEPTO_HE50 = 'Horas extras al 50%'
const CONCEPTO_HE100 = 'Horas extras al 100%'

function newLine(partial?: Partial<MoneyLine>): MoneyLine {
  return {
    id: crypto.randomUUID(),
    concepto: partial?.concepto ?? '',
    importe: partial?.importe ?? 0,
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

function App() {
  const reciboRef = useRef<HTMLElement | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const [consorcioNombre, setConsorcioNombre] = useState('')
  const [consorcioCuit, setConsorcioCuit] = useState('')
  const [consorcioDomicilio, setConsorcioDomicilio] = useState('')

  const [empleadoNombre, setEmpleadoNombre] = useState('')
  const [empleadoCuil, setEmpleadoCuil] = useState('')
  const [empleadoCategoria, setEmpleadoCategoria] = useState(
    'Encargado de edificio / consorcio',
  )

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

  const [haberes, setHaberes] = useState<MoneyLine[]>(defaultHaberes)
  const [descuentos, setDescuentos] = useState<MoneyLine[]>(defaultDescuentos)

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
      setHaberes((h) => ensureFirstBasico(h, row.basicoMensual))
    },
    [],
  )

  const aplicarEscalaUthgra = useCallback((id: string) => {
    setUthgraEscalaId(id)
    setSuterhEscalaId('')
    const row = UTHGRA_CCT401_PUBLICOS.find((r) => r.id === id)
    if (!row) return
    setEmpleadoCategoria(`${row.label} (${UTHGRA_401_META.nombre})`)
    setHaberes((h) => ensureFirstBasico(h, row.basicoMarzo2026))
  }, [])

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
          <article className="recibo" ref={reciboRef}>
            <header className="recibo-header">
              <div>
                <h2 className="recibo-title">Recibo de haberes</h2>
                <p className="recibo-periodo">Período: {periodoLabel}</p>
              </div>
              <div className="recibo-org">
                <strong>{consorcioNombre || '—'}</strong>
                <span>CUIT: {consorcioCuit || '—'}</span>
                <span>{consorcioDomicilio || '—'}</span>
              </div>
            </header>

            <div className="recibo-empleado">
              <div>
                <span className="label">Empleado</span>
                <span>{empleadoNombre || '—'}</span>
              </div>
              <div>
                <span className="label">CUIL</span>
                <span>{empleadoCuil || '—'}</span>
              </div>
              {fechaIngreso ? (
                <div>
                  <span className="label">Fecha de ingreso</span>
                  <span>{fechaIngreso}</span>
                </div>
              ) : null}
              <div className="span-row">
                <span className="label">Categoría</span>
                <span>{empleadoCategoria || '—'}</span>
              </div>
            </div>

            <table className="recibo-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th className="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr className="section-row">
                  <td colSpan={2}>Haberes</td>
                </tr>
                {haberes.map((l) => (
                  <tr key={l.id}>
                    <td>{l.concepto || '—'}</td>
                    <td className="num">{formatArs(l.importe)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td>Subtotal haberes</td>
                  <td className="num">{formatArs(totalHaberes)}</td>
                </tr>
                <tr className="section-row">
                  <td colSpan={2}>Descuentos</td>
                </tr>
                {descuentos.map((l) => (
                  <tr key={l.id}>
                    <td>{l.concepto || '—'}</td>
                    <td className="num">-{formatArs(l.importe)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td>Total descuentos</td>
                  <td className="num">-{formatArs(totalDescuentos)}</td>
                </tr>
              </tbody>
            </table>

            <footer className="recibo-footer">
              <div className="neto">
                <span>Líquido a percibir</span>
                <strong>{formatArs(neto)}</strong>
              </div>
              <p className="legal">
                Documento generado para uso interno del consorcio. Los importes y
                retenciones deben coincidir con la liquidación oficial y las
                alícuotas vigentes. Las escalas y porcentajes del simulador son
                referenciales.
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
