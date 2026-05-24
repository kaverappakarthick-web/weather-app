/**
 * POST /api/ai/briefing
 * Returns a structured JSON daily briefing. KV-cached 30 min.
 */
import {
  CORS, corsOptions, jsonResponse, errorResponse,
  MODEL_FLASH, checkRateLimit,
  sanitizeWeatherContext, briefingSystemPrompt,
  deepseekJSON, safeParseJSON, kvGet, kvPut,
  cacheKey, roundedHour,
} from './_shared.js'

export async function onRequestOptions() { return corsOptions() }

export async function onRequestPost({ request, env }) {
  if (await checkRateLimit(env, request)) {
    return errorResponse('Too many requests — please wait a moment.', 429)
  }

  let body
  try { body = await request.json() }
  catch { return errorResponse('Invalid JSON body', 400) }

  const { location, weatherContext } = body || {}
  const loc  = String(location || 'Unknown').slice(0, 100)
  const unit = weatherContext?.unit || 'C'

  // KV cache check
  const ck = cacheKey('briefing', loc, String(roundedHour()), unit)
  const hit = await kvGet(env, ck)
  if (hit) {
    const parsed = safeParseJSON(hit)
    if (parsed) return jsonResponse({ ...parsed, cached: true })
  }

  const contextJson = sanitizeWeatherContext(weatherContext)
  const apiKey = env.DEEPSEEK_API_KEY
  if (!apiKey) return errorResponse('AI service not configured', 503)

  const system = briefingSystemPrompt(unit)
  const user   = `Location: ${loc}\nWeather data: ${contextJson ?? '{}'}`

  try {
    const raw    = await deepseekJSON(apiKey, MODEL_FLASH, system, user)
    const parsed = safeParseJSON(raw)

    if (!parsed) return errorResponse('AI response could not be parsed', 502)

    // Validate required fields exist
    const valid = parsed.headline && parsed.summary
    if (!valid) return errorResponse('Incomplete AI response', 502)

    await kvPut(env, ck, JSON.stringify(parsed), 1800)  // 30 min TTL
    return jsonResponse(parsed)
  } catch (err) {
    console.error('[/api/ai/briefing]', err.message)
    return errorResponse('AI service temporarily unavailable', 503)
  }
}
