import { useEffect, useMemo, useRef, useState } from 'react'
import { MS_PER_DAY, formatSigned } from '../lib/rate'
import type { RateResult } from '../lib/types'

const MARGIN = { top: 16, right: 18, bottom: 28, left: 46 }
const HEIGHT = 230

/** Round a span up to a readable tick step (1, 2, 2.5 or 5 × a power of ten). */
function niceStep(span: number, targetCount: number): number {
  const rough = span / Math.max(1, targetCount)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalised = rough / magnitude
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10
  return step * magnitude
}

function ticksFor(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min]
  const step = niceStep(max - min, count)
  const start = Math.ceil(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(Number(v.toFixed(6)))
  return out
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export default function DriftChart({ rate }: { rate: RateResult }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom

  const scales = useMemo(() => {
    const xs = rate.points.map((p) => p.days)
    const ys = rate.points.map((p) => p.offsetSec)
    const fitEnds = [rate.interceptSec, rate.interceptSec + rate.secondsPerDay * Math.max(...xs)]

    const xMin = 0
    const xMax = Math.max(...xs) || 1
    // Always show zero: "how far from correct" only means something against it.
    let yMin = Math.min(0, ...ys, ...fitEnds)
    let yMax = Math.max(0, ...ys, ...fitEnds)
    const pad = Math.max((yMax - yMin) * 0.15, 1)
    yMin -= pad
    yMax += pad

    const xPad = xMax * 0.04
    const x = (days: number) => ((days - xMin + xPad) / (xMax - xMin + xPad * 2)) * innerW
    const y = (sec: number) => innerH - ((sec - yMin) / (yMax - yMin)) * innerH
    return { x, y, xMin, xMax, yMin, yMax }
  }, [innerH, innerW, rate])

  if (width === 0) return <div className="chart" ref={ref} style={{ height: HEIGHT }} />

  const t0 = rate.points[0].measurement.takenAt
  const yTicks = ticksFor(scales.yMin, scales.yMax, 4)
  const xTicks = ticksFor(0, scales.xMax, Math.min(4, rate.points.length))

  const fitX1 = scales.x(0)
  const fitY1 = scales.y(rate.interceptSec)
  const fitX2 = scales.x(scales.xMax)
  const fitY2 = scales.y(rate.interceptSec + rate.secondsPerDay * scales.xMax)

  const hovered = hoverIndex === null ? null : rate.points[hoverIndex]
  const last = rate.points[rate.points.length - 1]

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const localX = e.clientX - rect.left - MARGIN.left
    let best = 0
    let bestDist = Infinity
    rate.points.forEach((p, i) => {
      const d = Math.abs(scales.x(p.days) - localX)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    setHoverIndex(best)
  }

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Watch error over time. Fitted rate ${formatSigned(rate.secondsPerDay, 1)} seconds per day.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={scales.y(t)} y2={scales.y(t)} stroke="var(--gridline)" strokeWidth={1} />
              <text className="chart__tick" x={-8} y={scales.y(t)} dy="0.32em" textAnchor="end">
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          ))}

          {/* Zero is the reference the whole chart is about, so it reads stronger than the grid. */}
          <line x1={0} x2={innerW} y1={scales.y(0)} y2={scales.y(0)} stroke="var(--axis)" strokeWidth={1.5} />

          {xTicks.map((t) => (
            <text key={t} className="chart__tick" x={scales.x(t)} y={innerH + 18} textAnchor="middle">
              {new Date(t0 + t * MS_PER_DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          ))}

          <line
            x1={fitX1}
            y1={fitY1}
            x2={fitX2}
            y2={fitY2}
            stroke="var(--text-secondary)"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
          />

          {hovered && (
            <line
              x1={scales.x(hovered.days)}
              x2={scales.x(hovered.days)}
              y1={0}
              y2={innerH}
              stroke="var(--axis)"
              strokeWidth={1}
            />
          )}

          {rate.points.map((p, i) => (
            <circle
              key={p.measurement.id}
              cx={scales.x(p.days)}
              cy={scales.y(p.offsetSec)}
              r={hoverIndex === i ? 7 : 5}
              fill="var(--series-1)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          ))}

          {/* One direct label on the latest reading rather than a number on every point. */}
          <text
            x={scales.x(last.days)}
            y={scales.y(last.offsetSec) - 14}
            textAnchor={last.days === scales.xMax ? 'end' : 'middle'}
            fontSize={12}
            fontWeight={600}
            fill="var(--text-primary)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatSigned(last.offsetSec, 1, 's')}
          </text>
        </g>
      </svg>

      {hovered && (
        <div
          className="tooltip"
          style={{
            left: Math.min(Math.max(scales.x(hovered.days) + MARGIN.left - 60, 4), width - 130),
            top: Math.max(scales.y(hovered.offsetSec) + MARGIN.top - 62, 0),
          }}
        >
          <div className="tooltip__row">
            <span className="muted">
              {new Date(hovered.measurement.takenAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="tooltip__row">
            <span className="muted">Error</span>
            <strong className="tabular">{formatSigned(hovered.offsetSec, 2, 's')}</strong>
          </div>
          <div className="tooltip__row">
            <span className="muted">Elapsed</span>
            <span className="tabular">{hovered.days.toFixed(2)} d</span>
          </div>
        </div>
      )}

      <div className="legend">
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: 'var(--series-1)' }} />
          Measured error
        </span>
        <span className="legend__item">
          <svg width="18" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="18" y2="5" stroke="var(--text-secondary)" strokeWidth="2" strokeDasharray="5 3" />
          </svg>
          Fitted rate
        </span>
      </div>
    </div>
  )
}
