# WeatherNow

A React + Vite weather app with a 3-D interactive globe, 7-day forecasts, air quality data, and DeepSeek-powered AI features — deployed on Cloudflare Pages.

## Features

- Current weather, hourly chart, 7-day forecast, air quality index
- 3-D WebGL globe (globe.gl) with per-country temperature colouring
- India state boundaries with full Survey of India Kashmir depiction
- **AI Briefing** — auto-generated daily summary card (what to wear, umbrella, commute tip)
- **AI Chat** — streaming weather assistant (slide-up drawer)
- **AI Planner** — ranks the best day this week for any activity
- **NL Search** — natural-language location/condition search intent parsing

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, globe.gl (Three.js) |
| Hosting | Cloudflare Pages (static) |
| AI Workers | Cloudflare Pages Functions (4 endpoints) |
| AI Model | DeepSeek API (`deepseek-v4-flash` / `deepseek-v4-pro`) |
| Caching | Cloudflare Workers KV (`AI_CACHE`) |
| Weather data | OpenWeatherMap API |

## AI Endpoints

| Route | Method | Model | Cache |
|-------|--------|-------|-------|
| `/api/ai/chat` | POST | deepseek-v4-flash | none (streaming SSE) |
| `/api/ai/briefing` | POST | deepseek-v4-flash | 30 min KV |
| `/api/ai/plan` | POST | deepseek-v4-pro | 60 min KV |
| `/api/ai/search` | POST | deepseek-v4-flash | none |

Rate limiting: 15 requests / minute per IP (KV-backed).

## Local Development

```bash
npm install
npm run dev          # Vite dev server (no AI — Workers not available locally)
```

To test AI endpoints locally, use Wrangler:

```bash
npx wrangler pages dev dist --kv AI_CACHE
```

Build first (`npm run build`), then serve with Wrangler so Pages Functions run.

## Deploy to Cloudflare Pages

### 1. Create KV namespace

```bash
npx wrangler kv namespace create AI_CACHE
# Copy the id and preview_id printed to stdout
```

Edit `wrangler.toml` and replace the placeholder IDs:

```toml
[[kv_namespaces]]
binding    = "AI_CACHE"
id         = "<paste id here>"
preview_id = "<paste preview_id here>"
```

### 2. Add DeepSeek API key secret

```bash
npx wrangler pages secret put DEEPSEEK_API_KEY
# Paste your key when prompted
```

### 3. Push / connect repo

Connect the repo to Cloudflare Pages (dashboard or CLI). Build settings:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20 |

Cloudflare Pages auto-deploys `functions/` as Workers on every push.

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `DEEPSEEK_API_KEY` | Pages secret | DeepSeek API key |
| `VITE_OWM_KEY` | Pages env var | OpenWeatherMap API key |

## Project Structure

```
weather-app/
  functions/
    api/ai/
      _shared.js      # Rate limiting, KV cache, DeepSeek helpers
      chat.js         # Streaming chat endpoint
      briefing.js     # Daily briefing (JSON, cached)
      plan.js         # Activity planner (JSON, cached)
      search.js       # NL search intent parser
  public/
    india-states.json # Simplified India state boundaries (local, ~67 KB gzip)
  scripts/
    prepare-india.js  # One-time data prep script for india-states.json
    append-ai-css.js  # Appended AI styles to index.css (run once)
  src/
    ai.js             # Frontend API client (buildWeatherContext, streamChat, etc.)
    AIBriefing.jsx    # Daily briefing card component
    AIChatDrawer.jsx  # Streaming chat drawer + FAB
    AIPlanner.jsx     # Activity planner modal
    Globe.jsx         # 3-D globe with temperature colouring
  wrangler.toml
```
