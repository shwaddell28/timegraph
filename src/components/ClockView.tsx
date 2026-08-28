import { useTimeSync, useTrueNow } from '../lib/useTimeSync'
import { timeSync } from '../lib/timeSync'
import type { SyncState } from '../lib/timeSync'

const QUALITY_LABEL: Record<SyncState['quality'], string> = {
  good: 'Synced',
  fair: 'Synced',
  poor: 'Weak sync',
  unsynced: 'Not synced',
}

function SyncPill({ sync }: { sync: SyncState }) {
  const dotClass =
    sync.quality === 'good' ? 'dot dot--good' : sync.quality === 'fair' ? 'dot dot--fair' : sync.quality === 'poor' ? 'dot dot--poor' : 'dot'

  return (
    <button className="sync" onClick={() => void timeSync.sync()} disabled={sync.syncing}>
      <span className={dotClass} aria-hidden="true" />
      {sync.syncing
        ? 'Syncing…'
        : sync.lastSyncAt
          ? `${QUALITY_LABEL[sync.quality]} · ±${Math.round(sync.uncertaintyMs)} ms · ${sync.source}`
          : QUALITY_LABEL[sync.quality]}
    </button>
  )
}

/** Twelve pips that fill across each second, so the beat is visible at a glance. */
function SecondTicks({ now }: { now: number }) {
  const fraction = (now % 1000) / 1000
  const lit = Math.floor(fraction * 12)
  return (
    <div className="clock__ticks" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className={`clock__tick${i <= lit ? ' clock__tick--on' : ''}`} />
      ))}
    </div>
  )
}

export default function ClockView({ onMeasure }: { onMeasure: () => void }) {
  const sync = useTimeSync()
  const now = useTrueNow()
  const d = new Date(now)

  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const tenths = Math.floor(d.getMilliseconds() / 100)

  return (
    <div className="stack">
      <section className="card clock">
        <p className="clock__time" aria-live="off">
          {hh}:{mm}:{ss}
          <span className="clock__subsecond">.{tenths}</span>
        </p>
        <SecondTicks now={now} />
        <p className="clock__date">
          {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <div style={{ marginTop: 16 }}>
          <SyncPill sync={sync} />
        </div>
        {sync.error && (
          <p className="small" style={{ color: 'var(--critical)', marginBottom: 0 }}>
            {sync.error} — falling back to this device's clock.
          </p>
        )}
      </section>

      <button className="btn btn--primary btn--block" onClick={onMeasure}>
        Add measurement
      </button>

      <section className="card">
        <h2 className="card__title">Setting the watch</h2>
        <p className="small secondary" style={{ margin: 0 }}>
          Pull the crown at the top of a minute to stop the second hand, line the hands up with the
          next whole minute shown above, then push the crown in exactly as the display reaches it.
          Start a new run in History afterwards so the rate is measured from the reset.
        </p>
      </section>
    </div>
  )
}
