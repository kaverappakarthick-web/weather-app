/**
 * POST /api/ai/plan
 * Activity planner — uses deepseek-v4-pro for multi-day reasoning.
 * KV-cached 60 min per activity+location+forecast combination.
 */
import {
  CORS, corsOptions, jsonResponse, errorResponse,
  MODEL_PRO, checkRateLimit,
  sanitizeWeatherContext, plannerSystemPrompt,
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

  const { activity, location, weeklyForecast, unit = 'C' } = body || {}
  const act = String(activity || '').trim().slice(0, 200)
  const loc = String(location  || 'Unknown').slice(0, 100)

  if (!act)            return errorResponse('activity required', 400)
  if (!weeklyForecast) return errorResponse('weeklyForecast required', 400)

  // KV cache (keyed by activity + location + hour)
  const ck = cacheKey('plan', act.toLowerCase(), loc, String(roundedHour()), unit)
  const hit = await kvGet(env, ck)
  if (hit) {
    const parsed = safeParseJSON(hit)
    if (parsed) return jsonResponse({ days: parsed, cached: true })
  }

  const apiKey = env.DEEPSEEK_API_KEY
  if (!apiKey) return errorResponse('AI service not configured', 503)

  const contextJson = sanitizeWeatherContext({ unit, daily: weeklyForecast })
  const system = plannerSystemPrompt(act, unit)
  const user   = `Activity: ${act}\nLocation: ${loc}\nForecast: ${contextJson}`

  try {
    // Use MODEL_PRO for complex multi-day reasoning
    const raw    = await deepseekJSON(apiKey, MODEL_PRO, system, user, 40_000)
    const parsed = safeParseJSON(raw)

    if (!Array.isArray(parsed) || !parsed.length) {
      return errorResponse('AI response could not be parsed', 502)
    }

    await kvPut(env, ck, JSON.stringify(parsed), 3600)  // 60 min TTL
    return jsonResponse({ days: parsed })
  } catch (err) {
    console.error('[/api/ai/plan]', err.message)
    return errorResponse('AI service temporarily unavailable', 503)
  }
}
