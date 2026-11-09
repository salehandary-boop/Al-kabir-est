import { Fragment, useEffect, useState } from 'react'
import type { BoqView, ItemView, PartView } from '../../main/db/boq'
import { api } from './api'
import { EditCell } from './EditCell'
import { fmt, fmtQty } from './format'
import { TakeoffPanel } from './TakeoffPanel'

const UNITS = ['m2', 'm3', 'm', 'nr', 'LS', 'pt', 't', 'kg', 'set', 'item']

type Props = { projectId: number; onBack: () => void; onError: (m: string) => void; onNotice: (m: string) => void }

export function BoqPage({ projectId, onBack, onError, onNotice }: Props) {
  const [estimateId, setEstimateId] = useState<number>()
  const [boq, setBoq] = useState<BoqView>()
  const [tab, setTab] = useState<number | 'summary'>('summary')
  const [takeoffItem, setTakeoffItem] = useState<ItemView>()
  const [trades, setTrades] = useState<{ code: string; title: string }[]>([])
  const [busy, setBusy] = useState(false)

  const load = async (id = estimateId) => {
    if (!id) return
    const b = await api.getBoq(id)
    setBoq(b)
    return b
  }

  useEffect(() => {
    api.trades().then(setTrades)
    api
      .latestEstimateId(projectId)
      .then(async (id) => {
        setEstimateId(id)
        const b = await load(id)
        if (b?.parts[0]) setTab(b.parts[0].id)
      })
      .catch((e) => onError(e.message))
  }, [projectId])

  // Runs a change, then reloads the BOQ so every total is recalculated.
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      const r = await fn()
      await load()
      return r
    } catch (e) {
      onError((e as Error).message)
      await load()
      return undefined
    }
  }

  const importExcel = async () => {
    const file = await api.pickExcelFile()
    if (!file || !estimateId) return
    setBusy(true)
    const r = await run(() => api.importExcel(estimateId, file))
    setBusy(false)
    if (r) onNotice(`Imported ${r.items} items in ${r.sections} sections across ${r.parts} parts.`)
  }

  if (!boq || !estimateId) return <p className="muted">Loading…</p>
  const cur = boq.project.currency
  const s = boq.summary
  const part = boq.parts.find((p) => p.id === tab)

  return (
    <div>
      <div className="page-head">
        <button className="ghost" onClick={onBack}>
          ← Projects
        </button>
        <div>
          <h2 className="title">{boq.project.name}</h2>
          <div className="muted">
            {[boq.project.client, boq.project.location, boq.project.standard, `Revision ${boq.estimate.revision}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="head-total">
          <div className="muted small">Total incl. VAT</div>
          <div className="big">
            {cur} {fmt(s.totalWithVat)}
          </div>
        </div>
      </div>

      <nav className="tabs">
        <button className={tab === 'summary' ? 'tab active' : 'tab'} onClick={() => setTab('summary')}>
          Summary
        </button>
        {boq.parts.map((p) => (
          <button
            key={p.id}
            className={tab === p.id ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(p.id)
              setTakeoffItem(undefined)
            }}
          >
            <span className="tab-label" title={p.name}>{p.name}</span>
          </button>
        ))}
        <button
          className="tab add"
          onClick={async () => {
            const id = await run(() => api.addPart(estimateId, { name: `Part ${boq.parts.length + 1}` }))
            if (id) setTab(id)
          }}
        >
          + Part
        </button>
        <button className="import" disabled={busy} onClick={importExcel}>
          {busy ? 'Importing…' : 'Import BOQ from Excel'}
        </button>
      </nav>

      {tab === 'summary' && (
        <SummaryTab boq={boq} cur={cur} estimateId={estimateId} run={run} onOpenPart={setTab} onImport={importExcel} />
      )}

      {part && (
        <PartTab
          part={part}
          cur={cur}
          trades={trades}
          run={run}
          openItem={takeoffItem?.id}
          onDims={(it) => setTakeoffItem(takeoffItem?.id === it.id ? undefined : it)}
          dimsPanel={(it) => (
            <TakeoffPanel item={it} onClose={() => setTakeoffItem(undefined)} onChanged={() => load()} onError={onError} />
          )}
          onDeleted={() => {
            setTab('summary')
            setTakeoffItem(undefined)
          }}
        />
      )}

    </div>
  )
}

type Run = <T>(fn: () => Promise<T>) => Promise<T | undefined>

function PartTab(props: {
  part: PartView
  cur: string
  trades: { code: string; title: string }[]
  run: Run
  openItem?: number
  onDims: (it: ItemView) => void
  dimsPanel: (it: ItemView) => React.ReactNode
  onDeleted: () => void
}) {
  const { part, cur, trades, run } = props
  const used = new Set(part.sections.map((s) => s.code))
  const free = trades.filter((t) => !used.has(t.code))

  return (
    <>
      <section className="card part-head">
        <label>
          Code prefix
          <EditCell value={part.code} placeholder="e.g. B" onCommit={(v) => run(() => api.updatePart(part.id, { code: v }))} />
        </label>
        <label className="grow">
          Part name
          <EditCell value={part.name} onCommit={(v) => run(() => api.updatePart(part.id, { name: v }))} />
        </label>
        <div className="section-total">
          <div className="muted small">Part total</div>
          {cur} {fmt(part.total)}
        </div>
        <button
          className="icon"
          title="Delete this part"
          onClick={async () => {
            if (!confirm(`Delete "${part.name}" with all its sections and items?`)) return
            await run(() => api.deletePart(part.id))
            props.onDeleted()
          }}
        >
          ×
        </button>
      </section>

      {part.sections.length === 0 && (
        <section className="card empty">
          <p>No sections yet. Add a trade section below, for example C. Masonry.</p>
        </section>
      )}

      {part.sections.map((sec) => (
        <section className="card" key={sec.id}>
          <div className="section-head">
            <div className="w-code">
              <EditCell value={sec.code} className="strong" onCommit={(v) => run(() => api.updateSection(sec.id, { code: v }))} />
            </div>
            <div className="grow">
              <EditCell value={sec.title} className="strong" onCommit={(v) => run(() => api.updateSection(sec.id, { title: v }))} />
            </div>
            <div className="section-total">
              {cur} {fmt(sec.total)}
            </div>
            <button
              className="icon"
              title="Delete section"
              onClick={() => {
                if (confirm(`Delete section "${sec.code}. ${sec.title}" and all its items?`)) run(() => api.deleteSection(sec.id))
              }}
            >
              ×
            </button>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th className="w-code">Item</th>
                <th>Description</th>
                <th className="w-unit">Unit</th>
                <th className="num w-qty">Qty</th>
                <th className="w-dims"></th>
                <th className="num w-rate">Unit rate ({cur})</th>
                <th className="num w-amount">Amount ({cur})</th>
                <th className="w-remarks">Remarks</th>
                <th className="w-x"></th>
              </tr>
            </thead>
            <tbody>
              {sec.items.map((it) => (
                <Fragment key={it.id}>
                <tr className={props.openItem === it.id ? 'selected' : ''}>
                  <td>
                    <EditCell value={it.code} onCommit={(v) => run(() => api.updateItem(it.id, { code: v }))} />
                  </td>
                  <td>
                    <EditCell
                      value={it.description}
                      title={it.description}
                      placeholder="Describe the work"
                      onCommit={(v) => run(() => api.updateItem(it.id, { description: v }))}
                    />
                  </td>
                  <td>
                    <select className="cell" value={it.unit} onChange={(e) => run(() => api.updateItem(it.id, { unit: e.target.value }))}>
                      {(UNITS.includes(it.unit) ? UNITS : [it.unit, ...UNITS]).map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <EditCell
                      value={fmtQty(it.quantity)}
                      align="right"
                      className={it.fromTakeoff ? 'from-takeoff' : ''}
                      title={it.fromTakeoff ? 'From the dimension sheet. Typing a number replaces it.' : undefined}
                      onCommit={(v) => run(() => api.updateItem(it.id, { quantity: v }))}
                    />
                  </td>
                  <td>
                    <button className={`dims ${it.takeoffCount ? 'has' : ''}`} title="Open the dimension sheet" onClick={() => props.onDims(it)}>
                      {it.takeoffCount ? `Dims (${it.takeoffCount})` : 'Dims'}
                    </button>
                  </td>
                  <td>
                    <EditCell
                      value={it.rate === '' ? '' : fmt(it.rate)}
                      align="right"
                      placeholder="0.00"
                      className={it.rate === '' ? 'unpriced' : ''}
                      onCommit={(v) => run(() => api.updateItem(it.id, { rate: v }))}
                    />
                  </td>
                  <td className="num">{fmt(it.amount)}</td>
                  <td>
                    <EditCell value={it.remarks} title={it.remarks} onCommit={(v) => run(() => api.updateItem(it.id, { remarks: v }))} />
                  </td>
                  <td>
                    <button className="icon" title="Delete item" onClick={() => run(() => api.deleteItem(it.id))}>
                      ×
                    </button>
                  </td>
                </tr>
                {props.openItem === it.id && (
                  <tr className="dims-row">
                    <td colSpan={9}>{props.dimsPanel(it)}</td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <button className="ghost add" onClick={() => run(() => api.addItem(sec.id))}>
            + Add item
          </button>
        </section>
      ))}

      <div className="add-section">
        <select
          value=""
          onChange={(e) => {
            const t = trades.find((x) => x.code === e.target.value)
            if (t) run(() => api.addSection(part.id, { code: t.code, title: t.title }))
            else if (e.target.value === 'other') run(() => api.addSection(part.id, { code: 'X', title: 'New section' }))
          }}
        >
          <option value="">+ Add section…</option>
          {free.map((t) => (
            <option key={t.code} value={t.code}>
              {t.code}. {t.title}
            </option>
          ))}
          <option value="other">Other (custom)</option>
        </select>
      </div>
    </>
  )
}

function SummaryTab(props: {
  boq: BoqView
  cur: string
  estimateId: number
  run: Run
  onOpenPart: (id: number) => void
  onImport: () => void
}) {
  const { boq, cur, estimateId, run } = props
  const s = boq.summary
  return (
    <section className="card summary">
      <h2>Summary of tender</h2>
      {boq.parts.length === 0 ? (
        <div className="empty-start">
          <p>This BOQ is empty. You can import an existing BOQ from Excel, or add a part (for example "Basement floor") and fill it in.</p>
          <button onClick={props.onImport}>Import BOQ from Excel</button>
        </div>
      ) : (
        <table className="sum">
          <thead>
            <tr>
              <th className="w-code">No.</th>
              <th>Part</th>
              <th></th>
              <th className="num">Amount ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {boq.parts.map((p, i) => (
              <tr key={p.id} className="clickable" onClick={() => props.onOpenPart(p.id)}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td className="muted small">{p.sections.reduce((n, x) => n + x.items.length, 0)} items</td>
                <td className="num">{fmt(p.total)}</td>
              </tr>
            ))}
            <tr className="rule">
              <td></td>
              <td>Direct cost</td>
              <td></td>
              <td className="num strong">{fmt(s.directCost)}</td>
            </tr>
            {s.markups.map((m) => (
              <tr key={m.id}>
                <td></td>
                <td>{m.name}</td>
                <td className="pct">
                  <EditCell value={m.percent} align="right" onCommit={(v) => run(() => api.updateMarkup(m.id, v))} />%
                </td>
                <td className="num">{fmt(m.amount)}</td>
              </tr>
            ))}
            <tr className="rule">
              <td></td>
              <td>Total tender price (excl. VAT)</td>
              <td></td>
              <td className="num strong">{fmt(s.totalBeforeVat)}</td>
            </tr>
            <tr>
              <td></td>
              <td>VAT</td>
              <td className="pct muted">{s.vatPct}%</td>
              <td className="num">{fmt(s.vat)}</td>
            </tr>
            <tr className="rule grand">
              <td></td>
              <td>Total incl. VAT ({cur})</td>
              <td></td>
              <td className="num">{fmt(s.totalWithVat)}</td>
            </tr>
            {boq.estimate.localCurrency && (
              <tr>
                <td></td>
                <td>
                  Exchange rate ({boq.estimate.localCurrency} per {cur})
                </td>
                <td className="pct">
                  <EditCell
                    value={boq.estimate.exchangeRate === '' ? '' : fmt(boq.estimate.exchangeRate, 0)}
                    align="right"
                    placeholder="e.g. 89,500"
                    onCommit={(v) => run(() => api.setExchangeRate(estimateId, v))}
                  />
                </td>
                <td className="num">{s.totalLocal ? `${boq.estimate.localCurrency} ${fmt(s.totalLocal, 0)}` : ''}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <p className="muted small">Overheads, contingency and profit apply one after another on the running total, then VAT on the result.</p>
    </section>
  )
}
