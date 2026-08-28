import { useCallback, useEffect, useState } from 'react'
import ClockView from './components/ClockView'
import HistoryView from './components/HistoryView'
import MeasureFlow from './components/MeasureFlow'
import {
  addMeasurement,
  deleteMeasurement,
  deleteSession,
  exportState,
  importState,
  loadState,
  saveState,
  startNewSession,
} from './lib/storage'
import { timeSync } from './lib/timeSync'
import type { AppState, Measurement } from './lib/types'

type Tab = 'clock' | 'history'

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [tab, setTab] = useState<Tab>('clock')
  const [measuring, setMeasuring] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => saveState(state), [state])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const handleSave = useCallback((m: Measurement) => {
    setState((s) => addMeasurement(s, m))
    setMeasuring(false)
    setTab('history')
  }, [])

  const handleExport = useCallback(() => {
    const blob = new Blob([exportState(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timegraph-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [state])

  const handleImport = useCallback(async (file: File) => {
    try {
      setState(importState(await file.text()))
      setToast('Imported')
    } catch (err) {
      setToast(`Import failed: ${(err as Error).message}`)
    }
  }, [])

  return (
    <div className="app">
      <div className="app__body">
        {tab === 'clock' ? (
          <ClockView onMeasure={() => setMeasuring(true)} />
        ) : (
          <HistoryView
            state={state}
            onMeasure={() => setMeasuring(true)}
            onSelectSession={(id) => setState((s) => ({ ...s, activeSessionId: id }))}
            onNewSession={() => setState((s) => startNewSession(s, timeSync.now()))}
            onDeleteMeasurement={(sessionId, id) => setState((s) => deleteMeasurement(s, sessionId, id))}
            onDeleteSession={(id) => setState((s) => deleteSession(s, id))}
            onExport={handleExport}
            onImport={(file) => void handleImport(file)}
          />
        )}
      </div>

      {toast && (
        <div className="tooltip" style={{ position: 'fixed', bottom: 88, left: 16, right: 16, textAlign: 'center' }}>
          {toast}
        </div>
      )}

      <nav className="tabbar" role="tablist">
        <button
          className="tabbar__item"
          role="tab"
          aria-selected={tab === 'clock'}
          onClick={() => setTab('clock')}
        >
          Clock
        </button>
        <button
          className="tabbar__item"
          role="tab"
          aria-selected={tab === 'history'}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </nav>

      {measuring && <MeasureFlow onSave={handleSave} onCancel={() => setMeasuring(false)} />}
    </div>
  )
}
