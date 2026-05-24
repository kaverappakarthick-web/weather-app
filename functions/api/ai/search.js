/**
 * POST /api/ai/search
 * Natural-language query → structured JSON intent.
 * The frontend executes the intent using existing weather logic.
 */
import {
  CORS, corsOptions, jsonResponse, errorResponse,
  MODEL_FLASH, checkRateLimit,
  searchSystemPrompt, deepseekJSON, safeParseJSON,
} from './_shared.js'

export async function onRequestOptions() { return corsOptions() }

export async function onRequestPost({ request, env }) {
  if (await checkRateLimit(env, request)) {
    return errorResponse('Too many requests — please wait a moment.', 429)
  }

  let body
  try { body = await request.json() }
  catch { return errorResponse('Invalid JSON body', 400) }

  const query = String(body?.query || '').trim().slice(0, 500)
  if (!query) return errorResponse('query required', 400)

  const apiKey = env.DEEPSEEK_API_KEY
  if (!apiKey) return errorResponse('AI service not configured', 503)

  try {
    const raw    = await deepseekJSON(apiKey, MODEL_FLASH, searchSystemPrompt(), query, 15_000)
    const parsed = safeParseJSON(raw)
    if (!parsed) return errorResponse('Could not parse search intent', 502)
    return jsonResponse({ intent: parsed, query })
  } catch (err) {
    console.error('[/api/ai/search]', err.message)
    return errorResponse('AI service temporarily unavailable', 503)
  }
}
