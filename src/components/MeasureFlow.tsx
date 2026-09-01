import { useCallback, useMemo, useState } from 'react'
import { computeRawOffset, formatClock, formatSigned } from '../lib/rate'
import { newId } from '../lib/storage'
import { timeSync } from '../lib/timeSync'
import type { Measurement } from '../lib/types'
import { useTimeSync, useTrueNow } from '../lib/useTimeSync'

type Step = 'tap' | 'confirm'

const STEPS: Step[] = ['tap', 'confirm']

/**
 * How precisely a person can tap the moment the hand crosses the 12, in ms.
 * People anticipate a regularly-moving hand well; any fixed reaction bias
 * cancels out of the rate, and the remaining scatter is well under this.
 */
const TAP_UNCERTAINTY_MS = 100

export default function MeasureFlow({
  onSave,
  onCancel,
}: {
  onSave: (m: Measurement) => void
  onCancel: () => void
}) {
  const sync = useTimeSync()
  const [step, setStep] = useState<Step>('tap')
  const [error, setError] = useState<string | null>(null)
  const [takenAt, setTakenAt] = useState<number | null>(null)
  const [minuteAdjust, setMinuteAdjust] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const liveNow = useTrueNow(step === 'tap')

  const tap = useCallback(
    (trueMs: number) => {
      // A click synthesised after pointerdown arrives once the button has
      // already gone; guard anyway so a keyboard press can't land twice.
      if (step !== 'tap') return
      if (sync.quality === 'unsynced') {
        setError('Wait for the clock to sync before measuring — the reading needs a true time to compare against.')
        return
      }
      setError(null)
      setTakenAt(trueMs)
      setStep('confirm')
    },
    [step, sync.quality],
  )

  // The tap happens when the hand points at the 60-second mark, so the dial
  // reads exactly 0.000s and the tap's own true timestamp does all the work.
  const watchSeconds = 0
  const rawOffsetSec = takenAt !== null ? computeRawOffset(watchSeconds, takenAt) : 0
  const totalOffset = rawOffsetSec + minuteAdjust * 60

  // Independent error sources, so they combine in quadrature rather than summing.
  const uncertaintyMs = useMemo(() => {
    const syncErr = Number.isFinite(sync.uncertaintyMs) ? sync.uncertaintyMs : 500
    return Math.sqrt(syncErr ** 2 + TAP_UNCERTAINTY_MS ** 2)
  }, [sync.uncertaintyMs])

  const save = useCallback(() => {
    if (takenAt === null) return
    setSaving(true)
    onSave({
      id: newId(),
      takenAt,
      watchSeconds,
      rawOffsetSec,
      minuteAdjust,
      uncertaintyMs,
      note: note.trim() || undefined,
    })
  }, [takenAt, minuteAdjust, note, onSave, rawOffsetSec, uncertaintyMs])

  const stepNumber = STEPS.indexOf(step)

  return (
    <div className="sheet">
      <div className="sheet__head">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <span className="sheet__title">Add measurement</span>
        <span style={{ width: 72 }} />
      </div>

      <div className="steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={`steps__pip${i <= stepNumber ? ' steps__pip--done' : ''}`} />
        ))}
      </div>

      <div className="sheet__body">
        {error && (
          <div className="notice notice--error" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        )}

        {step === 'tap' && (
          <div className="tapstage">
            <p className="small secondary" style={{ margin: 0, textAlign: 'center' }}>
              Watch the second hand. As it reaches the 12, tap below — the reading is stamped
              with true time at that instant.
            </p>
            <p className="tapstage__clock tabular">{formatClock(liveNow)}</p>
            <button
              className="btn btn--primary btn--block tapstage__button"
              // Touch synthesises `click` from `touchend`, which would time the
              // finger lifting rather than landing — and how long a button is
              // held varies enough between taps to show up as scatter.
              // `click` stays for keyboard use, where there is no pointerdown.
              onPointerDown={(e) => tap(timeSync.atEvent(e.timeStamp))}
              onClick={() => tap(timeSync.now())}
              disabled={sync.quality === 'unsynced'}
            >
              Tap at the 12
            </button>
          </div>
        )}

        {step === 'confirm' && takenAt !== null && (
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
              <h2 className="card__title">Watch error at this instant</h2>
              <p className="hero__value">
                {formatSigned(totalOffset, 2)}
                <span className="hero__unit">s</span>
              </p>
              <p className="hero__caption">
                {totalOffset > 0 ? 'ahead of' : totalOffset < 0 ? 'behind' : 'level with'} true time
                {' · ±'}
                {(uncertaintyMs / 1000).toFixed(2)}s
              </p>
            </div>

            <table className="table">
              <tbody>
                <tr>
                  <td>True time at tap</td>
                  <td>{formatClock(takenAt, true)}</td>
                </tr>
                <tr>
                  <td>Second hand read</td>
                  <td>{watchSeconds.toFixed(2)}s</td>
                </tr>
                <tr>
                  <td>Clock sync</td>
                  <td>
                    {sync.source ?? 'device'} · ±{Math.round(sync.uncertaintyMs)}ms
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="field">
              <label htmlFor="minutes">Whole minutes off (only if more than 30s out)</label>
              <div className="row">
                <div className="stepper">
                  <button onClick={() => setMinuteAdjust((v) => v - 1)} aria-label="One minute slower">
                    −
                  </button>
                  <span className="stepper__value">{minuteAdjust > 0 ? `+${minuteAdjust}` : minuteAdjust}</span>
                  <button onClick={() => setMinuteAdjust((v) => v + 1)} aria-label="One minute faster">
                    +
                  </button>
                </div>
                <span className="small muted">
                  A second hand alone can only show ±30s. Leave at 0 unless you know the watch is a
                  full minute or more out.
                </span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="note">Note (optional)</label>
              <input
                id="note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="worn all day, dial up overnight…"
              />
            </div>
          </div>
        )}
      </div>

      <div className="sheet__foot">
        {step === 'confirm' && (
          <>
            <button className="btn" onClick={() => setStep('tap')} disabled={saving}>
              Re-tap
            </button>
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save measurement'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
