import { useEffect, useState } from 'react'
import { timeSync } from './timeSync'
import type { SyncState } from './timeSync'

/** Live sync state, kept fresh by a background re-sync. */
export function useTimeSync(resyncIntervalMs = 5 * 60_000): SyncState {
  const [state, setState] = useState<SyncState>(() => timeSync.getState())

  useEffect(() => {
    const unsubscribe = timeSync.subscribe(setState)
    void timeSync.sync()

    const interval = window.setInterval(() => void timeSync.sync(), resyncIntervalMs)
    // A backgrounded tab's clock can be stepped or throttled while away.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && timeSync.ageMs() > 60_000) void timeSync.sync()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      unsubscribe()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [resyncIntervalMs])

  return state
}

/** Re-renders on every animation frame, returning the current true time. */
export function useTrueNow(active = true): number {
  const [now, setNow] = useState(() => timeSync.now())

  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      setNow(timeSync.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  return now
}
