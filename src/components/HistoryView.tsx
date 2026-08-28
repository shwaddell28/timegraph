import { useMemo, useState } from 'react'
import DriftChart from './DriftChart'
import {
  computeRate,
  describeRate,
  formatDuration,
  formatRate,
  formatSigned,
  withinCosc,
} from '../lib/rate'
import type { AppState, Session } from '../lib/types'

interface Props {
  state: AppState
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteMeasurement: (sessionId: string, measurementId: string) => void
  onDeleteSession: (sessionId: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onMeasure: () => void
}

function Empty({ onMeasure }: { onMeasure: () => void }) {
  return (
    <div className="card">
      <div className="empty">
        <p className="empty__title">No measurements yet</p>
        <p className="small">
          Set the watch against the clock, then take a reading. A second reading a day or so later
          is what turns two points into a rate.
        </p>
        <button className="btn btn--primary" style={{ marginTop: 14 }} onClick={onMeasure}>
          Add measurement
        </button>
      </div>
    </div>
  )
}

function SessionSummary({ session }: { session: Session }) {
  const rate = useMemo(() => computeRate(session.measurements), [session.measurements])
  const [showTable, setShowTable] = useState(false)

  if (!rate) {
    const only = session.measurements[0]
    return (
      <div className="card">
        <h2 className="card__title">Rate</h2>
        <p className="hero__caption" style={{ marginTop: 0 }}>
          {session.measurements.length === 0
            ? 'No readings in this run yet.'
            : `One reading so far, ${formatSigned(only.rawOffsetSec + only.minuteAdjust * 60, 1, 's')} from true. Take another after a day to get a rate.`}
        </p>
      </div>
    )
  }

  const ambiguous = rate.points.filter((p) => p.ambiguous).length
  const cosc = withinCosc(rate.secondsPerDay)

  return (
    <>
      <div className="card">
        <div className="hero">
          <h2 className="card__title">Average rate</h2>
          <p className="hero__value">
            {formatSigned(rate.secondsPerDay, 1)}
            <span className="hero__unit">s/day</span>
          </p>
          <p className="hero__caption">
            {describeRate(rate.secondsPerDay)} · {rate.points.length} readings over{' '}
            {formatDuration(rate.spanDays)}
          </p>
          <div style={{ marginTop: 10 }}>
            <span className={`badge ${cosc ? 'badge--good' : 'badge--warn'}`}>
              {cosc ? '✓ Within COSC (−4/+6 s/day)' : '△ Outside COSC (−4/+6 s/day)'}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">Error over time</h2>
        <DriftChart rate={rate} />
        <div className="row row--between" style={{ marginTop: 12 }}>
          <button className="btn btn--ghost small" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Hide data table' : 'Show data table'}
          </button>
        </div>
        {showTable && (
          <table className="table">
            <thead>
              <tr>
                <th>Taken</th>
                <th>Elapsed</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {rate.points.map((p) => (
                <tr key={p.measurement.id}>
                  <td>{new Date(p.measurement.takenAt).toLocaleString()}</td>
                  <td>{p.days.toFixed(2)} d</td>
                  <td>{formatSigned(p.offsetSec, 2, 's')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="card__title">Fit quality</h2>
        <div className="tiles">
          <div className="tile">
            <div className="tile__label">Least squares</div>
            <div className="tile__value">{formatRate(rate.secondsPerDay)}</div>
          </div>
          <div className="tile">
            <div className="tile__label">First to last</div>
            <div className="tile__value">{formatRate(rate.endpointSecondsPerDay)}</div>
          </div>
          <div className="tile">
            <div className="tile__label">Uncertainty</div>
            <div className="tile__value">
              {Number.isFinite(rate.stdErrorPerDay) ? `±${rate.stdErrorPerDay.toFixed(1)}` : '—'}
            </div>
          </div>
          <div className="tile">
            <div className="tile__label">Scatter</div>
            <div className="tile__value">{rate.residualRms.toFixed(2)}s</div>
          </div>
        </div>
        <p className="small secondary" style={{ marginBottom: 0, marginTop: 12 }}>
          {rate.points.length < 3
            ? 'With two readings the fit is exact by construction and cannot report its own error. A third reading gives the rate a confidence interval.'
            : 'Scatter is how far readings sit from the fitted line — a mechanical watch that changes rate with position or wind will scatter more than one that does not.'}
        </p>
        {ambiguous > 0 && (
          <div className="notice notice--warn" style={{ marginTop: 12 }}>
            <span>
              {ambiguous} reading{ambiguous > 1 ? 's' : ''} fell far enough from the expected drift
              that the whole-minute correction is a guess. Measure more often, or set the minutes
              manually on those readings.
            </span>
          </div>
        )}
      </div>
    </>
  )
}

export default function HistoryView({
  state,
  onSelectSession,
  onNewSession,
  onDeleteMeasurement,
  onDeleteSession,
  onExport,
  onImport,
  onMeasure,
}: Props) {
  const session =
    state.sessions.find((s) => s.id === state.activeSessionId) ??
    state.sessions[state.sessions.length - 1] ??
    null

  if (!session) return <Empty onMeasure={onMeasure} />

  const ordered = [...session.measurements].sort((a, b) => b.takenAt - a.takenAt)

  return (
    <div className="stack">
      {state.sessions.length > 1 && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="session">Run</label>
          <select id="session" value={session.id} onChange={(e) => onSelectSession(e.target.value)}>
            {state.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.measurements.length} reading{s.measurements.length === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>
      )}

      <SessionSummary session={session} />

      <div className="card">
        <h2 className="card__title">Readings</h2>
        {ordered.length === 0 && <p className="small secondary">Nothing in this run yet.</p>}
        {ordered.map((m) => (
          <div className="entry" key={m.id}>
            {m.thumbnail ? (
              <img className="entry__thumb" src={m.thumbnail} alt="" />
            ) : (
              <span className="entry__thumb" />
            )}
            <div className="entry__main">
              <div className="entry__when">{new Date(m.takenAt).toLocaleString()}</div>
              <div className="entry__meta">
                dial {m.watchSeconds.toFixed(2)}s · ±{(m.uncertaintyMs / 1000).toFixed(2)}s
                {m.note ? ` · ${m.note}` : ''}
              </div>
            </div>
            <div className="entry__value">{formatSigned(m.rawOffsetSec + m.minuteAdjust * 60, 1, 's')}</div>
            <button
              className="btn btn--ghost btn--danger small"
              style={{ padding: '6px 8px', minHeight: 0 }}
              onClick={() => onDeleteMeasurement(session.id, m.id)}
              aria-label="Delete reading"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="card__title">Run</h2>
        <p className="small secondary">
          Reset the watch against the clock and start a new run — the rate is only meaningful
          between two settings of the crown.
        </p>
        <div className="row wrap">
          <button className="btn" onClick={onNewSession}>
            Start new run
          </button>
          <button className="btn" onClick={onExport}>
            Export JSON
          </button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            Import
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onImport(file)
                e.target.value = ''
              }}
            />
          </label>
          <button className="btn btn--ghost btn--danger" onClick={() => onDeleteSession(session.id)}>
            Delete run
          </button>
        </div>
      </div>
    </div>
  )
}
