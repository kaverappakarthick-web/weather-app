/**
 * functions/api/ai/_shared.js
 * Shared utilities for all /api/ai/* Cloudflare Pages Function handlers.
 * Underscore prefix = not treated as a route.
 */

export const MODEL_FLASH = 'deepseek-v4-flash'
export const MODEL_PRO   = 'deepseek-v4-pro'
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

// ── CORS headers ──────────────────────────────────────────────────────────────
export const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function corsOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message, status = 500) {
  return jsonResponse({ error: message }, status)
}

// ── Per-IP rate limiter (KV-backed, 1-minute window) ─────────────────────────
const RATE_LIMIT = 15  // requests per minute per IP

export async function checkRateLimit(env, request) {
  if (!env.AI_CACHE) return false  // KV not available — skip limiting
  const ip  = request.headers.get('CF-Connecting-IP') || 'unknown'
  const min = Math.floor(Date.now() / 60_000)
  const key = `rl:${ip}:${min}`
  try {
    const cur = parseInt(await env.AI_CACHE.get(key) || '0', 10)
    if (cur >= RATE_LIMIT) return true   // blocked
    await env.AI_CACHE.put(key, String(cur + 1), { expirationTtl: 120 })
    return false
  } catch { return false }
}

// ── KV cache helpers ──────────────────────────────────────────────────────────
export async function kvGet(env, key) {
  if (!env.AI_CACHE) return null
  try { return await env.AI_CACHE.get(key) } catch { return null }
}

export async function kvPut(env, key, value, ttlSeconds) {
  if (!env.AI_CACHE) return
  try { await env.AI_CACHE.put(key, value, { expirationTtl: ttlSeconds }) } catch {}
}

// Simple hash for cache keys
export function cacheKey(prefix, ...parts) {
  const raw = parts.join('|')
  let h = 0
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0
  return `${prefix}:${Math.abs(h)}`
}

// Round to nearest hour for cache bucketing
export function roundedHour() {
  return Math.floor(Date.now() / 3_600_000)
}

// ── Input validation helpers ──────────────────────────────────────────────────
export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .slice(-20)                           // max 20 turns
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role:    m.role,
      content: String(m.content || '').slice(0, 2000),
    }))
}

export function sanitizeWeatherContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return null
  return JSON.stringify(ctx).slice(0, 6000)  // cap size
}

// ── System prompt builders ────────────────────────────────────────────────────
export function chatSystemPrompt(location, weatherContextJson, unit) {
  return `You are a friendly, precise weather assistant for WeatherNow.
Answer ONLY based on the weather data provided below — never invent numbers or forecasts.
Use ${unit === 'F' ? 'Fahrenheit (°F)' : 'Celsius (°C)'} for temperatures.
Be conversational and concise (2–4 sentences unless the user asks for more).
If asked something unrelated to weather or the location, politely redirect.
Do not include alarmist language unless the data genuinely shows severe conditions.

Location: ${location}
Current weather data (JSON):
${weatherContextJson}`
}

export function briefingSystemPrompt(unit) {
  return `You are a weather briefing generator.
Based ONLY on the weather data provided, return a STRICT JSON object matching this schema exactly:
{
  "headline": "string — 5-8 words, present tense, no punctuation",
  "summary": "string — 1-2 sentences natural language overview",
  "whatToWear": "string — brief clothing advice",
  "umbrella": { "needed": boolean, "when": "string describing timing, or null if not needed" },
  "commute": "string — brief commute/travel advice",
  "advisories": ["string — only include genuinely warranted items, else empty array"]
}
Return ONLY the raw JSON object. No markdown code fences. No explanation. No extra keys.
Use ${unit === 'F' ? 'Fahrenheit (°F)' : 'Celsius (°C)'}.`
}

export function searchSystemPrompt() {
  return `You are a weather search intent parser.
Parse the user's natural language query into a structured JSON object:
{
  "locations": ["array of location names extracted, or empty if none"],
  "timeframe": "today|tonight|tomorrow|this weekend|this week|or specific day name",
  "condition_filter": "rain|sun|cloud|snow|wind|hot|cold|clear|null if not specified",
  "metric": "temperature|humidity|wind|aqi|precipitation|null if not specified",
  "comparative": true or false (is this a comparison query like 'coldest city'?)
}
Return ONLY the raw JSON. No markdown fences.`
}

export function plannerSystemPrompt(activity, unit) {
  return `You are an outdoor activity planner.
Given a 7-day weather forecast, rank each day's suitability for: "${activity}".
Return a JSON array of ALL provided days, sorted best to worst:
[{
  "rank": 1,
  "day": "Monday",
  "date": "YYYY-MM-DD",
  "score": 0-100,
  "reason": "one concise sentence explaining why",
  "temp_max": number,
  "temp_min": number,
  "condition": "brief weather description",
  "condition_id": number (OpenWeatherMap code: 800=clear, 801=few clouds, 803=cloudy, 500=light rain, 501=moderate rain, 502=heavy rain, 600=light snow, 611=sleet, 200=thunderstorm, 721=haze, 741=fog),
  "precipitation_chance": number (0-100)
}]
Use ${unit === 'F' ? 'Fahrenheit (°F)' : 'Celsius (°C)'} for temperatures.
Be realistic — if all days are unsuitable, say so in the reason.
Return ONLY the raw JSON array. No markdown fences.`
}

// ── DeepSeek API call (non-streaming, JSON mode) ──────────────────────────────
export async function deepseekJSON(apiKey, model, systemPrompt, userContent, timeoutMs = 25_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent  },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens:  800,
        stream:      false,
      }),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const err = await resp.text().catch(() => '')
      throw new Error(`DeepSeek ${resp.status}: ${err.slice(0, 200)}`)
    }

    const data = await resp.json()
    return data.choices?.[0]?.message?.content ?? null
  } finally {
    clearTimeout(timer)
  }
}

// ── DeepSeek API call (streaming, returns Response) ───────────────────────────
export async function deepseekStream(apiKey, model, messages, timeoutMs = 45_000) {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), timeoutMs)

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens:  1000,
      stream:      true,
    }),
    signal: controller.signal,
  })

  if (!resp.ok) {
    const err = await resp.text().catch(() => '')
    throw new Error(`DeepSeek ${resp.status}: ${err.slice(0, 200)}`)
  }

  return resp  // caller streams resp.body
}

// ── Safe JSON parse (strips code fences if present) ──────────────────────────
export function safeParseJSON(raw) {
  if (!raw) return null
  try {
    // Strip markdown code fences
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(clean)
  } catch { return null }
}
