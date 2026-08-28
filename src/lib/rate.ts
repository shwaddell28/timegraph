import type { Measurement, RateResult, Session, UnwrappedPoint } from './types'

export const MS_PER_DAY = 86_400_000

/** Wrap a seconds value into (-30, +30], the range a second hand can express. */
export function wrapToHalfMinute(seconds: number): number {
  const wrapped = ((seconds + 30) % 60 + 60) % 60 - 30
  // The modulo above lands exactly -30 where +30 reads more naturally.
  return wrapped === -30 ? 30 : wrapped
}

/**
 * Seconds elapsed within the current minute at a given instant.
 *
 * Timezone-independent: every zone in modern use is offset from UTC by a whole
 * number of minutes, so the second hand's position doesn't depend on where you are.
 */
export function secondsWithinMinute(epochMs: number): number {
  return (epochMs % 60_000) / 1000
}

/** Clockwise degrees from 12 o'clock → seconds on the dial. */
export function angleToSeconds(angleDeg: number): number {
  return (((angleDeg % 360) + 360) % 360) / 6
}

/** Seconds on the dial → clockwise degrees from 12 o'clock. */
export function secondsToAngle(seconds: number): number {
  return (((seconds % 60) + 60) % 60) * 6
}

/**
 * The signed sub-minute error implied by a marked second hand at a known instant.
 * Positive means the watch is ahead of true time.
 */
export function computeRawOffset(watchSeconds: number, trueEpochMs: number): number {
  return wrapToHalfMinute(watchSeconds - secondsWithinMinute(trueEpochMs))
}

/**
 * A second hand only reveals the error modulo 60 seconds. Recover the continuous
 * error by assuming the watch kept doing roughly what it was already doing, and
 * picking the whole-minute correction that lands closest to that prediction.
 *
 * This holds as long as the drift between two consecutive measurements stays
 * under 30 seconds — at 10 s/day that is a three-day window. Points where the
 * choice was close to the boundary are flagged rather than silently trusted.
 */
export function unwrapOffsets(measurements: Measurement[]): UnwrappedPoint[] {
  const sorted = [...measurements].sort((a, b) => a.takenAt - b.takenAt)
  if (sorted.length === 0) return []

  const points: UnwrappedPoint[] = []
  const t0 = sorted[0].takenAt

  for (const m of sorted) {
    const days = (m.takenAt - t0) / MS_PER_DAY
    const base = m.rawOffsetSec + m.minuteAdjust * 60

    if (points.length === 0 || m.minuteAdjust !== 0) {
      // The first point defines the origin, and an explicit minute adjustment is
      // the user telling us the answer — neither needs a guess.
      points.push({ measurement: m, days, offsetSec: base, ambiguous: false })
      continue
    }

    const prev = points[points.length - 1]
    const slope = points.length >= 2 ? fitSlope(points) : 0
    const predicted = prev.offsetSec + slope * (days - prev.days)
    const k = Math.round((predicted - base) / 60)
    const offsetSec = base + k * 60
    // Within 10s of the ±30s boundary, the neighbouring k was nearly as good.
    const ambiguous = Math.abs(offsetSec - predicted) > 20

    points.push({ measurement: m, days, offsetSec, ambiguous })
  }

  return points
}

function fitSlope(points: UnwrappedPoint[]): number {
  const n = points.length
  const meanX = points.reduce((s, p) => s + p.days, 0) / n
  const meanY = points.reduce((s, p) => s + p.offsetSec, 0) / n
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    const dx = p.days - meanX
    sxx += dx * dx
    sxy += dx * (p.offsetSec - meanY)
  }
  return sxx === 0 ? 0 : sxy / sxx
}

/**
 * Least-squares rate for one session, in seconds per day. Positive is fast.
 * Returns null until there are two measurements far enough apart to define a slope.
 */
export function computeRate(measurements: Measurement[]): RateResult | null {
  const points = unwrapOffsets(measurements)
  if (points.length < 2) return null

  const n = points.length
  const meanX = points.reduce((s, p) => s + p.days, 0) / n
  const meanY = points.reduce((s, p) => s + p.offsetSec, 0) / n
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    const dx = p.days - meanX
    sxx += dx * dx
    sxy += dx * (p.offsetSec - meanY)
  }
  if (sxx === 0) return null

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX

  let ssr = 0
  for (const p of points) {
    const r = p.offsetSec - (intercept + slope * p.days)
    ssr += r * r
  }
  const residualRms = Math.sqrt(ssr / n)
  // With only two points the fit is exact and carries no information about
  // its own error, so the standard error is genuinely undefined.
  const stdErrorPerDay = n > 2 ? Math.sqrt(ssr / (n - 2) / sxx) : NaN

  const first = points[0]
  const last = points[n - 1]
  const spanDays = last.days - first.days
  const endpointSecondsPerDay =
    spanDays > 0 ? (last.offsetSec - first.offsetSec) / spanDays : NaN

  return {
    secondsPerDay: slope,
    endpointSecondsPerDay,
    stdErrorPerDay,
    residualRms,
    spanDays,
    points,
    interceptSec: intercept,
  }
}

export function activeSession(sessions: Session[], activeId: string | null): Session | null {
  return sessions.find((s) => s.id === activeId) ?? sessions[sessions.length - 1] ?? null
}

/* ---------- formatting ---------- */

export function formatSigned(value: number, digits = 1, unit = ''): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(digits)}${unit}`
}

export function formatRate(secondsPerDay: number): string {
  return formatSigned(secondsPerDay, 1, ' s/day')
}

export function describeRate(secondsPerDay: number): string {
  if (!Number.isFinite(secondsPerDay)) return 'not enough data'
  const abs = Math.abs(secondsPerDay)
  if (abs < 0.5) return 'keeping time'
  return abs < 1 ? (secondsPerDay > 0 ? 'barely fast' : 'barely slow') : secondsPerDay > 0 ? 'running fast' : 'running slow'
}

/** COSC certifies a mechanical wristwatch at −4/+6 seconds per day. */
export function withinCosc(secondsPerDay: number): boolean {
  return secondsPerDay >= -4 && secondsPerDay <= 6
}

export function formatDuration(days: number): string {
  if (!Number.isFinite(days)) return '—'
  if (days < 1 / 24) return `${Math.round(days * 24 * 60)} min`
  if (days < 1) return `${(days * 24).toFixed(1)} hr`
  return `${days.toFixed(1)} days`
}

export function formatClock(epochMs: number, withSubsecond = false): string {
  const d = new Date(epochMs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  if (!withSubsecond) return `${hh}:${mm}:${ss}`
  return `${hh}:${mm}:${ss}.${String(d.getMilliseconds()).padStart(3, '0')}`
}
