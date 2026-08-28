import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MS_PER_DAY,
  angleToSeconds,
  computeRate,
  computeRawOffset,
  secondsWithinMinute,
  unwrapOffsets,
  wrapToHalfMinute,
} from '../src/lib/rate.ts'
import type { Measurement } from '../src/lib/types.ts'

const BASE = Date.UTC(2026, 0, 1, 12, 0, 0)

function reading(days: number, trueOffsetSec: number, minuteAdjust = 0): Measurement {
  const takenAt = BASE + days * MS_PER_DAY
  const watchSeconds = (secondsWithinMinute(takenAt) + trueOffsetSec + 600) % 60
  return {
    id: `m${days}`,
    takenAt,
    watchSeconds,
    rawOffsetSec: computeRawOffset(watchSeconds, takenAt),
    minuteAdjust,
    uncertaintyMs: 50,
  }
}

test('wrapToHalfMinute folds into (-30, +30]', () => {
  assert.equal(wrapToHalfMinute(0), 0)
  assert.equal(wrapToHalfMinute(10), 10)
  assert.equal(wrapToHalfMinute(-10), -10)
  assert.equal(wrapToHalfMinute(35), -25)
  assert.equal(wrapToHalfMinute(-35), 25)
  assert.equal(wrapToHalfMinute(30), 30)
  assert.equal(wrapToHalfMinute(90), 30)
  assert.equal(wrapToHalfMinute(-90), 30)
})

test('angleToSeconds maps the dial clockwise from twelve', () => {
  assert.equal(angleToSeconds(0), 0)
  assert.equal(angleToSeconds(90), 15)
  assert.equal(angleToSeconds(180), 30)
  assert.equal(angleToSeconds(359.4), 59.9)
  assert.equal(angleToSeconds(-90), 45)
})

test('computeRawOffset is signed with fast watches positive', () => {
  const t = Date.UTC(2026, 0, 1, 12, 0, 10)
  assert.ok(Math.abs(computeRawOffset(13, t) - 3) < 1e-9)
  assert.ok(Math.abs(computeRawOffset(7, t) - -3) < 1e-9)
})

test('computeRawOffset stays small across the minute boundary', () => {
  // True time is 1 second past the minute; the watch reads 59s of the prior minute.
  const t = Date.UTC(2026, 0, 1, 12, 1, 1)
  assert.ok(Math.abs(computeRawOffset(59, t) - -2) < 1e-9)
})

test('unwrapOffsets recovers drift past the 30 second wrap', () => {
  const rate = 8
  const points = unwrapOffsets([0, 1, 2, 3, 4, 5].map((d) => reading(d, d * rate)))
  const recovered = points.map((p) => Number(p.offsetSec.toFixed(6)))
  assert.deepEqual(recovered, [0, 8, 16, 24, 32, 40])
  assert.ok(points.every((p) => !p.ambiguous))
})

test('unwrapOffsets handles a slow watch losing more than a minute', () => {
  const rate = -20
  const points = unwrapOffsets([0, 1, 2, 3, 4].map((d) => reading(d, d * rate)))
  assert.deepEqual(
    points.map((p) => Number(p.offsetSec.toFixed(6))),
    [0, -20, -40, -60, -80],
  )
})

test('an explicit minute adjustment overrides the guess', () => {
  const points = unwrapOffsets([reading(0, 0), reading(1, 5, 2)])
  assert.ok(Math.abs(points[1].offsetSec - (5 + 120)) < 1e-9)
})

test('computeRate returns the slope in seconds per day', () => {
  const rate = computeRate([0, 1, 2, 3].map((d) => reading(d, d * 6.5)))
  assert.ok(rate)
  assert.ok(Math.abs(rate.secondsPerDay - 6.5) < 1e-6)
  assert.ok(Math.abs(rate.endpointSecondsPerDay - 6.5) < 1e-6)
  assert.ok(rate.residualRms < 1e-6)
  assert.ok(Math.abs(rate.spanDays - 3) < 1e-9)
})

test('computeRate needs two readings at different times', () => {
  assert.equal(computeRate([]), null)
  assert.equal(computeRate([reading(0, 0)]), null)
  assert.equal(computeRate([reading(0, 0), reading(0, 0)]), null)
})

test('two readings give an exact fit with no reportable error', () => {
  const rate = computeRate([reading(0, 0), reading(2, 10)])
  assert.ok(rate)
  assert.ok(Math.abs(rate.secondsPerDay - 5) < 1e-9)
  assert.ok(Number.isNaN(rate.stdErrorPerDay))
})

test('scatter about the fit shows up in residualRms', () => {
  const rate = computeRate([reading(0, 0), reading(1, 5), reading(2, 8), reading(3, 15)])
  assert.ok(rate)
  assert.ok(rate.residualRms > 0.5)
  assert.ok(Number.isFinite(rate.stdErrorPerDay))
})

test('readings taken sub-daily still produce a per-day rate', () => {
  // Two readings six hours apart, three seconds gained.
  const rate = computeRate([reading(0, 0), reading(0.25, 3)])
  assert.ok(rate)
  assert.ok(Math.abs(rate.secondsPerDay - 12) < 1e-6)
})
