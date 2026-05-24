/**
 * ai.js — Frontend API client for /api/ai/* endpoints.
 * All DeepSeek calls go through the Worker — never directly from the browser.
 */

const BASE = '/api/ai'

// ── Build the weather context object sent to every AI endpoint ────────────────
export function buildWeatherContext(weather, hourly, forecast, airQuality, unit) {
  if (!weather) return null
  const toU = t => unit === 'F' ? Math.round(t * 9/5 + 32) : Math.round(t)
  return {
    location: `${weather.name}, ${weather.sys.country}`,
    unit,
    current: {
      temp:        toU(weather.main.temp),
      feels_like:  toU(weather.main.feels_like),
      temp_min:    toU(weather.main.temp_min),
      temp_max:    toU(weather.main.temp_max),
      humidity:    weather.main.humidity,
      pressure:    weather.main.pressure,
      visibility:  weather.visibility,
      wind_speed:  Math.round(weather.wind.speed * 3.6),
      wind_deg:    weather.wind.deg,
      wind_gust:   weather.wind.gust ? Math.round(weather.wind.gust * 3.6) : null,
      description: weather.weather[0].description,
      clouds:      weather.clouds.all,
      sunrise:     weather.sys.sunrise,
      sunset:      weather.sys.sunset,
    },
    hourly: hourly.slice(0, 8).map(h => ({
      time:                h.time,
      temp:                unit === 'F' ? h.tempF : h.temp,
      humidity:            h.humidity,
      pressure:            h.pressure,
      wind_speed:          h.windSpeed,
      precipitation_chance: h.pop,
    })),
    daily: forecast.map(d => ({
      day:                  new Date(d.dt * 1000).toLocaleDateString('en-US', { weekday: 'long' }),
      date:                 new Date(d.dt * 1000).toISOString().split('T')[0],
      temp_max:             unit === 'F' ? Math.round(d.temp_max * 9/5 + 32) : d.temp_max,
      temp_min:             unit === 'F' ? Math.round(d.temp_min * 9/5 + 32) : d.temp_min,
      precipitation_chance: d.pop,
      condition_id:         d.icon,
    })),
    aqi: airQuality ? {
      index:  airQuality.main.aqi,
      pm2_5:  airQuality.components.pm2_5,
      pm10:   airQuality.components.pm10,
      no2:    airQuality.components.no2,
      o3:     airQuality.components.o3,
    } : null,
  }
}

// ── Daily briefing ────────────────────────────────────────────────────────────
export async function fetchBriefing(weatherContext) {
  const resp = await fetch(`${BASE}/briefing`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      location:       weatherContext.location,
      weatherContext,
    }),
  })
  if (!resp.ok) throw new Error(`Briefing ${resp.status}`)
  return resp.json()
}

// ── Streaming chat (returns an async generator of string tokens) ──────────────
export async function* streamChat(messages, weatherContext) {
  const resp = await fetch(`${BASE}/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      messages,
      location:       weatherContext?.location,
      weatherContext,
    }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `Chat ${resp.status}`)
  }

  const reader  = resp.body.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''   // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const json  = JSON.parse(payload)
        const token = json.choices?.[0]?.delta?.content
        if (token) yield token
      } catch {}
    }
  }
}

// ── NL search intent parse ────────────────────────────────────────────────────
export async function parseSearchIntent(query) {
  const resp = await fetch(`${BASE}/search`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query }),
  })
  if (!resp.ok) throw new Error(`Search ${resp.status}`)
  return resp.json()   // { intent: {...}, query }
}

// ── Activity planner ──────────────────────────────────────────────────────────
export async function fetchPlan(activity, weatherContext) {
  const resp = await fetch(`${BASE}/plan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      activity,
      location:        weatherContext.location,
      weeklyForecast:  weatherContext.daily,
      unit:            weatherContext.unit,
    }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `Plan ${resp.status}`)
  }
  return resp.json()   // { days: [...] }
}
