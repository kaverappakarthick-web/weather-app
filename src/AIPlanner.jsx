/**
 * AIPlanner.jsx — "Best day for..." activity planner.
 * Uses deepseek-v4-pro via /api/ai/plan.
 */
import { useState, useEffect, useRef } from 'react'
import { fetchPlan } from './ai.js'
import WeatherIcon from './WeatherIcon.jsx'

const ACTIVITIES = [
  'hiking', 'cycling', 'running', 'picnic',
  'beach day', 'photography', 'sightseeing', 'gardening',
]

export default function AIPlanner({ weatherContext, open, onClose }) {
  const [activity, setActivity] = useState('')
  const [custom,   setCustom]   = useState('')
  const [days,     setDays]     = useState(null)
  const [status,   setStatus]   = useState('idle')  // idle|loading|done|error
  const [error,    setError]    = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setDays(null); setStatus('idle'); setError(''); setActivity(''); setCustom('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run() {
    const act = (custom.trim() || activity).trim()
    if (!act || !weatherContext) return
    setStatus('loading'); setError(''); setDays(null)

    try {
      const result = await fetchPlan(act, weatherContext)
      setDays(result.days || [])
      setStatus('done')
    } catch (err) {
      setError(err.message || 'Planner unavailable — try again.')
      setStatus('error')
    }
  }

  if (!open) return null

  const scoreColor = s =>
    s >= 80 ? '#34d399' : s >= 60 ? '#a3e635' : s >= 40 ? '#fbbf24' : '#f87171'

  return (
    <div className="planner-overlay" role="dialog" aria-modal="true" aria-label="Activity planner"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="planner-panel">
        <div className="planner-header">
          <span className="ai-badge">✦ AI</span>
          <span className="planner-title">Best day for…</span>
          <button className="chat-close" onClick={onClose} aria-label="Close planner">✕</button>
        </div>

        {/* Activity picker */}
        <div className="planner-chips">
          {ACTIVITIES.map(a => (
            <button
              key={a}
              className={`planner-chip ${activity === a && !custom ? 'planner-chip--active' : ''}`}
              onClick={() => { setActivity(a); setCustom('') }}
            >{a}</button>
          ))}
        </div>

        <div className="planner-custom-row">
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            placeholder="Or type your own activity…"
            value={custom}
            onChange={e => { setCustom(e.target.value); setActivity('') }}
            onKeyDown={e => e.key === 'Enter' && run()}
            maxLength={200}
            aria-label="Custom activity"
          />
          <button
            className="chat-send planner-go"
            onClick={run}
            disabled={(!activity && !custom.trim()) || status === 'loading'}
            aria-label="Find best day"
          >
            {status === 'loading' ? '…' : '→'}
          </button>
        </div>

        {/* Results */}
        {status === 'loading' && (
          <div className="planner-loading" aria-busy="true">
            <div className="planner-spinner"/>
            <span>Analysing forecast with AI…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="chat-error" role="alert">⚠ {error}</div>
        )}

        {status === 'done' && days && (
          <div className="planner-results" role="list" aria-label="Ranked days">
            {days.map((d, i) => (
              <div key={i} className={`planner-day ${i === 0 ? 'planner-day--best' : ''}`} role="listitem">
                <div className="planner-rank" style={{ color: scoreColor(d.score) }}>
                  #{d.rank}
                </div>
                <div className="planner-day-icon">
                  <WeatherIcon code={d.condition_id ?? 800} size={32}/>
                </div>
                <div className="planner-day-info">
                  <div className="planner-day-name">
                    {d.day}
                    {i === 0 && <span className="planner-best-badge">Best</span>}
                  </div>
                  <div className="planner-day-reason">{d.reason}</div>
                  <div className="planner-day-meta">
                    {d.temp_max}° / {d.temp_min}°{weatherContext.unit}
                    {d.precipitation_chance > 0 && ` · ${d.precipitation_chance}% rain`}
                  </div>
                </div>
                <div className="planner-score-bar">
                  <div style={{ height: `${d.score}%`, background: scoreColor(d.score) }}/>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="ai-disclaimer chat-disclaimer">AI-generated using deepseek-v4-pro · verify critical decisions</p>
      </div>
    </div>
  )
}
