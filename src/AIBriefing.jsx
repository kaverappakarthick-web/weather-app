/**
 * AIBriefing.jsx — Auto-generated daily briefing card.
 * Fetches once when weather loads; fails silently (core app unaffected).
 */
import { useEffect, useState } from 'react'
import { fetchBriefing } from './ai.js'

export default function AIBriefing({ weatherContext }) {
  const [briefing, setBriefing] = useState(null)
  const [status,   setStatus]   = useState('idle')  // idle|loading|done|error

  useEffect(() => {
    if (!weatherContext) return
    let cancelled = false
    setStatus('loading')
    setBriefing(null)

    fetchBriefing(weatherContext)
      .then(data => { if (!cancelled) { setBriefing(data); setStatus('done') } })
      .catch(() => { if (!cancelled) setStatus('error') })

    return () => { cancelled = true }
  }, [weatherContext?.location, weatherContext?.unit])  // re-fetch on location/unit change

  // Fail completely silently on error — the rest of the app is unaffected
  if (status === 'error' || status === 'idle') return null

  if (status === 'loading') {
    return (
      <div className="ai-briefing ai-briefing--loading" aria-busy="true" aria-label="Loading AI briefing">
        <div className="ai-briefing-shimmer"/>
        <div className="ai-briefing-shimmer ai-briefing-shimmer--short"/>
      </div>
    )
  }

  if (!briefing) return null

  return (
    <div className="ai-briefing" role="region" aria-label="AI daily briefing">
      <div className="ai-briefing-header">
        <span className="ai-badge">✦ AI</span>
        <span className="ai-briefing-headline">{briefing.headline}</span>
      </div>

      <p className="ai-briefing-summary">{briefing.summary}</p>

      <div className="ai-briefing-pills">
        {briefing.whatToWear && (
          <div className="ai-pill">
            <span className="ai-pill-icon">👕</span>
            <span>{briefing.whatToWear}</span>
          </div>
        )}
        {briefing.umbrella?.needed && (
          <div className="ai-pill ai-pill--alert">
            <span className="ai-pill-icon">☂</span>
            <span>Umbrella {briefing.umbrella.when ? `— ${briefing.umbrella.when}` : 'needed'}</span>
          </div>
        )}
        {briefing.commute && (
          <div className="ai-pill">
            <span className="ai-pill-icon">🚗</span>
            <span>{briefing.commute}</span>
          </div>
        )}
      </div>

      {briefing.advisories?.length > 0 && (
        <ul className="ai-advisories" aria-label="Weather advisories">
          {briefing.advisories.map((a, i) => (
            <li key={i}>⚠ {a}</li>
          ))}
        </ul>
      )}

      <p className="ai-disclaimer">AI-generated · verify critical decisions</p>
    </div>
  )
}
