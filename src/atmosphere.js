/**
 * Atmosphere Engine
 * Manages a full-screen Canvas particle system that reacts to weather condition + time of day.
 * Respects prefers-reduced-motion: degrades to static gradient only.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Palette definitions ──────────────────────────────────────────────────────
export const THEMES = {
  'clear-day':   { top: '#1a6fc4', bot: '#f4a736', particle: '#fffde0', name: 'clear-day' },
  'clear-dawn':  { top: '#2c1654', bot: '#f97316', particle: '#fde68a', name: 'clear-dawn' },
  'clear-dusk':  { top: '#7c2d6b', bot: '#f97316', particle: '#fde68a', name: 'clear-dusk' },
  'clear-night': { top: '#020818', bot: '#0f172a', particle: '#e2e8f0', name: 'clear-night' },
  'cloudy':      { top: '#374151', bot: '#6b7280', particle: '#d1d5db', name: 'cloudy' },
  'rain':        { top: '#0f172a', bot: '#1e3a5f', particle: '#93c5fd', name: 'rain' },
  'storm':       { top: '#09090b', bot: '#1e1b4b', particle: '#a78bfa', name: 'storm' },
  'snow':        { top: '#dbeafe', bot: '#93c5fd', particle: '#ffffff', name: 'snow' },
  'fog':         { top: '#6b7280', bot: '#9ca3af', particle: '#e5e7eb', name: 'fog' },
}

// ── Time-of-day resolver ─────────────────────────────────────────────────────
export function resolveThemeKey(conditionCode, sunrise, sunset) {
  const now = Date.now() / 1000
  const dayLen = sunset - sunrise
  const elapsed = now - sunrise
  const progress = Math.max(0, Math.min(1, elapsed / dayLen))

  let timeKey
  if (now < sunrise - 1800 || now > sunset + 1800) timeKey = 'night'
  else if (now < sunrise + 1800) timeKey = 'dawn'
  else if (now > sunset - 1800) timeKey = 'dusk'
  else timeKey = 'day'

  if (conditionCode >= 200 && conditionCode < 300) return { key: 'storm', progress }
  if (conditionCode >= 300 && conditionCode < 600) return { key: 'rain', progress }
  if (conditionCode >= 600 && conditionCode < 700) return { key: 'snow', progress }
  if (conditionCode >= 700 && conditionCode < 800) return { key: 'fog', progress }
  if (conditionCode >= 801) return { key: 'cloudy', progress }
  return { key: `clear-${timeKey}`, progress }
}

// ── Main engine factory ──────────────────────────────────────────────────────
export function createAtmosphere(canvas) {
  const ctx = canvas.getContext('2d')
  let particles = []
  let lightning = 0
  let animId = null
  let currentKey = 'clear-day'
  let hidden = false

  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  window.addEventListener('resize', resize)
  resize()

  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden
    if (!hidden && !animId) loop()
  })

  // ── Particle factories ───────────────────────────────────────────────────
  function makeRainDrop() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      len: 10 + Math.random() * 20,
      speed: 8 + Math.random() * 10,
      opacity: 0.3 + Math.random() * 0.5,
    }
  }

  function makeSnowflake() {
    const depth = Math.random()
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1 + depth * 3,
      speed: 0.3 + depth * 1.2,
      drift: (Math.random() - 0.5) * 0.4,
      opacity: 0.4 + depth * 0.5,
      depth,
    }
  }

  function makeStar() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.7,
      r: Math.random() * 1.5,
      twinkle: Math.random() * Math.PI * 2,
      speed: 0.01 + Math.random() * 0.02,
    }
  }

  function makeCloudParticle() {
    return {
      x: Math.random() * canvas.width,
      y: 50 + Math.random() * canvas.height * 0.4,
      r: 60 + Math.random() * 120,
      speed: 0.05 + Math.random() * 0.15,
      opacity: 0.04 + Math.random() * 0.06,
      layer: Math.random(),
    }
  }

  function makeFogPatch() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 200 + Math.random() * 300,
      speed: 0.02 + Math.random() * 0.05,
      opacity: 0.06 + Math.random() * 0.08,
    }
  }

  // ── Gradient painter ─────────────────────────────────────────────────────
  function drawGradient(theme) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
    grad.addColorStop(0, theme.top)
    grad.addColorStop(1, theme.bot)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // ── Scene initialiser ────────────────────────────────────────────────────
  function initScene(key) {
    currentKey = key
    particles = []
    if (REDUCED) return

    const W = canvas.width
    const H = canvas.height
    const isMobile = W < 768

    if (key === 'rain' || key === 'storm') {
      const count = isMobile ? 80 : 200
      for (let i = 0; i < count; i++) particles.push(makeRainDrop())
    } else if (key === 'snow') {
      const count = isMobile ? 60 : 140
      for (let i = 0; i < count; i++) particles.push(makeSnowflake())
    } else if (key === 'clear-night') {
      const count = isMobile ? 80 : 200
      for (let i = 0; i < count; i++) particles.push(makeStar())
    } else if (key === 'cloudy') {
      const count = isMobile ? 6 : 12
      for (let i = 0; i < count; i++) particles.push(makeCloudParticle())
    } else if (key === 'fog') {
      const count = isMobile ? 5 : 10
      for (let i = 0; i < count; i++) particles.push(makeFogPatch())
    }
  }

  // ── Draw functions ───────────────────────────────────────────────────────
  function drawRain(theme) {
    ctx.strokeStyle = theme.particle
    ctx.lineWidth = 1
    particles.forEach(p => {
      ctx.globalAlpha = p.opacity
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - 2, p.y + p.len)
      ctx.stroke()
      p.y += p.speed
      p.x -= 1
      if (p.y > canvas.height) {
        p.y = -p.len
        p.x = Math.random() * canvas.width
      }
    })
    ctx.globalAlpha = 1
  }

  function drawLightning() {
    if (Math.random() < 0.003) lightning = 8
    if (lightning > 0) {
      ctx.fillStyle = `rgba(200,180,255,${lightning * 0.025})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      lightning--
      if (lightning === 4) {
        // bolt
        const x = canvas.width * 0.3 + Math.random() * canvas.width * 0.4
        ctx.strokeStyle = '#c4b5fd'
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x - 20 + Math.random() * 40, canvas.height * 0.3)
        ctx.lineTo(x + 30 + Math.random() * 20, canvas.height * 0.55)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }

  function drawSnow(theme) {
    ctx.fillStyle = theme.particle
    particles.forEach(p => {
      ctx.globalAlpha = p.opacity
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
      p.y += p.speed
      p.x += p.drift
      if (p.y > canvas.height + 10) {
        p.y = -10
        p.x = Math.random() * canvas.width
      }
    })
    ctx.globalAlpha = 1
  }

  function drawStars(theme) {
    particles.forEach(p => {
      p.twinkle += p.speed
      const alpha = 0.4 + 0.4 * Math.sin(p.twinkle)
      ctx.globalAlpha = alpha
      ctx.fillStyle = theme.particle
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    // occasional shooting star
    if (Math.random() < 0.002) {
      const sx = Math.random() * canvas.width
      const sy = Math.random() * canvas.height * 0.4
      const grad = ctx.createLinearGradient(sx, sy, sx + 80, sy + 40)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(1, 'rgba(255,255,255,0.8)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + 80, sy + 40)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  function drawClouds() {
    particles.forEach(p => {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
      grad.addColorStop(0, `rgba(255,255,255,${p.opacity})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
      p.x += p.speed
      if (p.x - p.r > canvas.width) p.x = -p.r
    })
  }

  function drawFog() {
    particles.forEach(p => {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
      grad.addColorStop(0, `rgba(200,210,220,${p.opacity})`)
      grad.addColorStop(1, 'rgba(200,210,220,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
      p.x += p.speed
      if (p.x - p.r > canvas.width) p.x = -p.r
    })
  }

  function drawSunGlow(theme) {
    const cx = canvas.width * 0.72
    const cy = canvas.height * 0.18
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300)
    grad.addColorStop(0, 'rgba(255,220,80,0.18)')
    grad.addColorStop(0.5, 'rgba(255,180,40,0.08)')
    grad.addColorStop(1, 'rgba(255,180,40,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // ── Main render loop ─────────────────────────────────────────────────────
  function loop() {
    if (hidden) { animId = null; return }
    const theme = THEMES[currentKey] || THEMES['clear-day']
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawGradient(theme)

    if (!REDUCED) {
      if (currentKey === 'clear-day' || currentKey === 'clear-dawn' || currentKey === 'clear-dusk') {
        drawSunGlow(theme)
      } else if (currentKey === 'rain') {
        drawRain(theme)
      } else if (currentKey === 'storm') {
        drawRain(theme)
        drawLightning()
      } else if (currentKey === 'snow') {
        drawSnow(theme)
      } else if (currentKey === 'clear-night') {
        drawStars(theme)
      } else if (currentKey === 'cloudy') {
        drawClouds()
      } else if (currentKey === 'fog') {
        drawFog()
      }
    }

    animId = requestAnimationFrame(loop)
  }

  return {
    setCondition(key) {
      initScene(key)
      if (!animId) loop()
    },
    destroy() {
      if (animId) cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }
}
