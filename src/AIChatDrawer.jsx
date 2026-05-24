/**
 * AIChatDrawer.jsx — Streaming chat drawer + floating Ask button.
 * Keyboard-accessible, ARIA live region, honors prefers-reduced-motion.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { streamChat } from './ai.js'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const STARTERS = [
  'What should I wear today?',
  'Will it rain today?',
  'Is it a good day for a walk?',
  'How humid is it?',
  'When does it get dark?',
]

// Minimal markdown renderer — no innerHTML, no extra deps
function MarkdownText({ text }) {
  const lines = text.split('\n')
  return (
    <div className="md-text">
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i}/>
        // Bullet
        const isBullet = /^[-*•]\s/.test(line)
        const content  = isBullet ? line.slice(2) : line
        // Inline bold/italic/code via spans
        const parts = parseInline(content)
        return isBullet
          ? <div key={i} className="md-bullet">· {parts}</div>
          : <span key={i} className="md-line">{parts}</span>
      })}
    </div>
  )
}

function parseInline(text) {
  const tokens = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index))
    if (m[2])      tokens.push(<strong key={m.index}>{m[2]}</strong>)
    else if (m[3]) tokens.push(<em     key={m.index}>{m[3]}</em>)
    else if (m[4]) tokens.push(<code   key={m.index} className="md-code">{m[4]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) tokens.push(text.slice(last))
  return tokens
}

export default function AIChatDrawer({ weatherContext, open, onClose }) {
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [streaming,  setStreaming]  = useState(false)
  const [error,      setError]      = useState('')

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const abortRef     = useRef(false)   // set true to stop stream mid-way

  // Focus input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), REDUCED ? 0 : 300)
      setError('')
    }
  }, [open])

  // Scroll to bottom after each message chunk
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' })
  }, [messages])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = useCallback(async (text) => {
    const content = (text || input).trim()
    if (!content || streaming) return

    setInput('')
    setError('')
    abortRef.current = false

    const userMsg = { role: 'user', content }
    const nextHistory = [...messages, userMsg]
    setMessages(nextHistory)
    setStreaming(true)

    // Placeholder assistant message for streaming tokens
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      let full = ''
      for await (const token of streamChat(nextHistory, weatherContext)) {
        if (abortRef.current) break
        full += token
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: full }
          return updated
        })
      }
    } catch (err) {
      setError(err.message || 'AI unavailable — try again shortly.')
      // Remove the empty placeholder if stream failed immediately
      setMessages(prev => {
        const last = prev[prev.length - 1]
        return last?.content === '' ? prev.slice(0, -1) : prev
      })
    } finally {
      setStreaming(false)
    }
  }, [input, messages, streaming, weatherContext])

  function stopStream() {
    abortRef.current = true
    setStreaming(false)
  }

  if (!open) return null

  return (
    <div className="chat-overlay" role="dialog" aria-modal="true" aria-label="AI Weather Assistant"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="chat-drawer">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-title">
            <span className="ai-badge">✦ AI</span>
            <span>Weather Assistant</span>
          </div>
          <button className="chat-close" onClick={onClose} aria-label="Close chat">✕</button>
        </div>

        {/* Messages */}
        <div className="chat-messages" role="log" aria-live="polite" aria-label="Chat messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon">⛅</div>
              <p>Ask anything about the weather in <strong>{weatherContext?.location ?? 'this location'}</strong></p>
              <div className="chat-starters">
                {STARTERS.map(s => (
                  <button key={s} className="chat-starter" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg--${m.role}`}>
              {m.role === 'assistant' && (
                <span className="chat-msg-badge" aria-hidden="true">✦</span>
              )}
              <div className="chat-msg-body">
                {m.role === 'assistant'
                  ? <MarkdownText text={m.content || ''}/>
                  : <span>{m.content}</span>
                }
                {/* Typing cursor on last assistant message while streaming */}
                {streaming && i === messages.length - 1 && m.role === 'assistant' && (
                  <span className="chat-cursor" aria-hidden="true"/>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="chat-error" role="alert">⚠ {error}</div>
          )}

          <div ref={bottomRef}/>
        </div>

        {/* Input row */}
        <div className="chat-input-row">
          {streaming ? (
            <button className="chat-stop" onClick={stopStream} aria-label="Stop generating">
              ⏹ Stop
            </button>
          ) : (
            <>
              <input
                ref={inputRef}
                className="chat-input"
                type="text"
                placeholder="Ask about the weather…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                aria-label="Chat message input"
                maxLength={500}
              />
              <button
                className="chat-send"
                onClick={() => send()}
                disabled={!input.trim()}
                aria-label="Send message"
              >↑</button>
            </>
          )}
        </div>

        <p className="ai-disclaimer chat-disclaimer">AI-generated · verify critical decisions</p>
      </div>
    </div>
  )
}
