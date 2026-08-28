/** A single reading of the watch against true time. */
export interface Measurement {
  id: string
  /** True (sync-corrected) wall clock at the moment of the tap, ms since epoch. */
  takenAt: number
  /**
   * Where the second hand pointed, in seconds within the minute (0–60).
   * Always 0 for tap-at-12 readings; photo-marked readings from older versions
   * carry the angle-derived value.
   */
  watchSeconds: number
  /**
   * Signed sub-minute error, wrapped to (-30, +30]. Positive = watch is ahead.
   * This is `watchSeconds` minus true seconds-within-minute.
   */
  rawOffsetSec: number
  /** Whole minutes the user added when the watch is off by more than 30s. */
  minuteAdjust: number
  /** Half-width of the uncertainty at the tap (clock sync plus tapping), in ms. */
  uncertaintyMs: number
  /** Legacy: downscaled JPEG of a photo-based reading. No longer captured. */
  thumbnail?: string
  note?: string
}

/**
 * Measurements between two settings of the crown. Rate is only meaningful
 * within a session — resetting the watch discontinuously changes the offset.
 */
export interface Session {
  id: string
  startedAt: number
  label: string
  measurements: Measurement[]
}

export interface AppState {
  version: 1
  sessions: Session[]
  activeSessionId: string | null
}

/** A measurement with its wrap ambiguity resolved into a continuous offset. */
export interface UnwrappedPoint {
  measurement: Measurement
  /** Days since the first measurement in the session. */
  days: number
  /** Continuous, unwrapped offset in seconds. Positive = watch ahead. */
  offsetSec: number
  /** True when unwrapping had to guess across a gap wide enough to be ambiguous. */
  ambiguous: boolean
}

export interface RateResult {
  /** Least-squares slope, seconds gained per day. Positive = running fast. */
  secondsPerDay: number
  /** Endpoint-to-endpoint rate, as an independent cross-check. */
  endpointSecondsPerDay: number
  /** Standard error of the slope, in seconds per day. */
  stdErrorPerDay: number
  /** Root-mean-square of residuals about the fit, in seconds. */
  residualRms: number
  /** Total span covered by the fit, in days. */
  spanDays: number
  points: UnwrappedPoint[]
  /** Intercept in seconds, so the fitted line is intercept + slope * days. */
  interceptSec: number
}
