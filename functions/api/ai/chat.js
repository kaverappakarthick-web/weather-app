/**
 * POST /api/ai/chat
 * Streaming conversational weather assistant.
 * Proxies DeepSeek SSE stream — key never reaches the browser.
 */
import {
  CORS, corsOptions, errorResponse,
  MODEL_FLASH, checkRateLimit,
  sanitizeMessages, sanitizeWeatherContext,
  chatSystemPrompt, deepseekStream,
} from './_shared.js'

export async function onRequestOptions() { return corsOptions() }

export async function onRequestPost({ request, env }) {
  // Rate limit
  if (await checkRateLimit(env, request)) {
    return errorResponse('Too many requests — please wait a moment.', 429)
  }

  let body
  try { body = await request.json() }
  catch { return errorResponse('Invalid JSON body', 400) }

  const { messages, location, weatherContext } = body || {}

  if (!messages?.length) return errorResponse('messages required', 400)

  const cleanMessages  = sanitizeMessages(messages)
  const contextJson    = sanitizeWeatherContext(weatherContext)
  const loc            = String(location || 'Unknown location').slice(0, 100)
  const unit           = weatherContext?.unit || 'C'

  if (!cleanMessages.length) return errorResponse('No valid messages', 400)

  const apiKey = env.DEEPSEEK_API_KEY
  if (!apiKey) return errorResponse('AI service not configured', 503)

  const systemPrompt = chatSystemPrompt(loc, contextJson ?? '{}', unit)

  try {
    const upstream = await deepseekStream(apiKey, MODEL_FLASH, [
      { role: 'system', content: systemPrompt },
      ...cleanMessages,
    ])

    // Pass the SSE stream straight through to the client
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('[/api/ai/chat]', err.message)
    return errorResponse('AI service temporarily unavailable', 503)
  }
}
