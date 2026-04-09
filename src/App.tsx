import { useMemo, useState } from 'react'
import './App.css'
import { formatArs, parseArsInput, roundMoney } from './money'

type MoneyLine = {
  id: string
  concepto: string
  importe: number
}

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
  newLine({ concepto: 'Sueldo básico / jornal', importe: 0 }),
]

const defaultDescuentos: MoneyLine[] = [
  newLine({ concepto: 'Jubilación (aportes)', importe: 0 }),
  newLine({ concepto: 'PAMI / Ley 19.032', importe: 0 }),
  newLine({ concepto: 'Obra social', importe: 0 }),
]

function App() {
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
          <button type="button" className="btn primary" onClick={() => window.print()}>
            Imprimir / PDF
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

          <h2>Haberes</h2>
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
          <article className="recibo">
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
                alícuotas vigentes.
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
