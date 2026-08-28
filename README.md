# Timegraph

A precise reference clock and rate tracker for mechanical watches. Set your watch
against a network-synced clock, tap the moment the second hand sweeps past the 12,
and Timegraph works out how many seconds a day it gains or loses.

Runs as an installable web app — no App Store, no native build.

## How a measurement works

A second hand only tells you the error *modulo 60 seconds*, and aligning a marker
over a photograph by eye costs precision. Timegraph works around both:

1. **Sync.** The clock is disciplined against a time API using an NTP-style
   round trip: several samples are taken, each placing the server's timestamp at
   the midpoint of its own round trip, and the lowest-latency sample wins.
   Averaging would drag the estimate toward whichever samples were most delayed.
   In practice this lands within a few tens of milliseconds.
2. **Tap.** When the second hand points straight at the 12, the dial reads
   exactly 0.000 seconds — no framing, no marking. The app stamps the tap with
   true time and computes the offset directly. Any consistent reaction bias
   cancels out of the rate; only the scatter matters.
3. **Fit.** Errors are plotted over time and fitted by least squares. The slope
   is the rate in seconds per day.

### Recovering drift past ±30 seconds

Once a watch is more than half a minute out, the second hand alone is ambiguous.
Timegraph resolves this by assuming the watch kept doing roughly what it was
already doing and picking the whole-minute correction closest to that prediction.
That holds as long as drift between consecutive readings stays under 30 seconds —
at 10 s/day, a three-day window. Readings where the choice was close to the
boundary are flagged rather than silently trusted, and you can pin the minutes by
hand on any reading.

### Runs

Rate is only meaningful between two settings of the crown, so readings are
grouped into runs. Reset the watch, start a new run.

## Accuracy

Each reading combines two independent sources of error in quadrature: clock sync
(typically ±10–50 ms) and how consistently a person can tap a moving hand
crossing a fixed marker (±100 ms, conservative). That lands at roughly ±0.1 s
per reading — which over a week-long run is well under a tenth of a second per
day of rate error. Consistent reaction bias doesn't even show up in the rate;
it shifts every reading by the same amount and the slope is indifferent to it.

COSC certifies a mechanical wristwatch at −4/+6 s/day; the summary flags whether
yours is inside that band.

## Running it

```sh
npm install
npm run dev      # https://localhost:5173
```

The dev server speaks https only so `npm run dev:lan` works from a phone on the
LAN — open the LAN address and accept the self-signed certificate warning once.

```sh
npm test         # rate and unwrapping maths
npm run build    # production bundle in dist/
npm run preview
```

To install on iOS: open the site in Safari, Share → Add to Home Screen.

Readings live in `localStorage` on the device. Export to JSON from the History
tab to back them up or move them.

## Layout

| Path | What's in it |
|---|---|
| `src/lib/timeSync.ts` | NTP-style HTTP clock sync, with fallback sources |
| `src/lib/rate.ts` | Wrapping, unwrapping, and least-squares rate |
| `src/lib/storage.ts` | Persistence, runs, import/export |
| `src/components/MeasureFlow.tsx` | The tap → confirm flow |
| `src/components/DriftChart.tsx` | Error-over-time chart |
| `scripts/make-icon.mjs` | Renders `public/icon.png` from distance fields |

## Known limits

- **One watch.** The data model has runs but no notion of multiple watches;
  adding a watch layer above runs would be the natural next step.
- **The tap is the only measurement.** Ticking (quartz) hands dwell on the 12
  for up to a second, and dials with no usable 12 marker leave you guessing.
  Sweep-mechanical hands and an index or numeral at 12 give the best reading;
  the recorded ±100 ms covers the rest.
- **Positional variation is not separated.** A mechanical watch runs at different
  rates dial-up versus crown-down. Timegraph shows this as scatter about the fit
  rather than breaking it out; note the resting position on each reading if you
  want to reason about it.
