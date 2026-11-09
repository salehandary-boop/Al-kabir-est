import { useEffect, useState } from 'react'
import type { ItemView, TakeoffView } from '../../main/db/boq'
import { api } from './api'
import { EditCell } from './EditCell'
import { fmtQty } from './format'

interface Props {
  item: ItemView
  onClose: () => void
  onChanged: () => void
  onError: (m: string) => void
}

/** Dimension sheet: count x L x W x H per line, deductions subtract. Sums into the item quantity. */
export function TakeoffPanel({ item, onClose, onChanged, onError }: Props) {
  const [lines, setLines] = useState<TakeoffView[]>([])
  const [total, setTotal] = useState('0')

  const load = async () => {
    const r = await api.listTakeoff(item.id)
    setLines(r.lines)
    setTotal(r.total)
  }
  useEffect(() => {
    load()
  }, [item.id])

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await load()
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <div className="dims-panel">
      <div className="dims-head">
        <div>
          <strong>Dimension sheet</strong>{' '}
          <span className="muted">
            {item.code} · {item.unit}
          </span>
        </div>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>Description</th>
            <th style={{ width: 110 }}>Drawing</th>
            <th className="num w-num">No.</th>
            <th className="num w-num">L</th>
            <th className="num w-num">W</th>
            <th className="num w-num">H</th>
            <th style={{ width: 60 }}>Deduct</th>
            <th className="num" style={{ width: 100 }}>Result</th>
            <th className="w-x"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className={l.deduct ? 'deduct' : ''}>
              <td>
                <EditCell value={l.description} placeholder="e.g. Footing F1" onCommit={(v) => run(() => api.updateTakeoff(l.id, { description: v }))} />
              </td>
              <td>
                <EditCell value={l.drawingRef} placeholder="S-101" onCommit={(v) => run(() => api.updateTakeoff(l.id, { drawingRef: v }))} />
              </td>
              {(['count', 'length', 'width', 'height'] as const).map((k) => (
                <td key={k} className="w-num">
                  <EditCell value={l[k]} align="right" onCommit={(v) => run(() => api.updateTakeoff(l.id, { [k]: v }))} />
                </td>
              ))}
              <td className="center">
                <input type="checkbox" checked={l.deduct} onChange={(e) => run(() => api.updateTakeoff(l.id, { deduct: e.target.checked }))} />
              </td>
              <td className="num">{fmtQty(l.result)}</td>
              <td>
                <button className="icon" title="Delete line" onClick={() => run(() => api.deleteTakeoff(l.id))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7}>
              <button className="ghost" onClick={() => run(() => api.addTakeoff(item.id))}>
                + Add line
              </button>
            </td>
            <td className="num strong">
              {fmtQty(total)} {item.unit}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <p className="muted small">Blank dimensions count as 1. Tick "Deduct" for openings and voids. The total becomes the item quantity.</p>
    </div>
  )
}
