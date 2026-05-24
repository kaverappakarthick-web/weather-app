import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { createAtmosphere, resolveThemeKey, THEMES } from './atmosphere.js'
import WeatherIcon from './WeatherIcon.jsx'
import TileDrawer from './TileDrawer.jsx'
import './App.css'

// Lazy-load the globe (Three.js is ~2MB — only load when needed)
const GlobeView = lazy(() => import('./Globe.jsx'))

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY || '1de5a2ec29141f30436323f5aedf3848'
const API_BASE = 'https://api.openweathermap.org/data/2.5'

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWindDir(deg) {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8]
}
function getAQIInfo(aqi) {
  return [{},{label:'Good',color:'#34d399'},{label:'Fair',color:'#a3e635'},
    {label:'Moderate',color:'#fbbf24'},{label:'Poor',color:'#f97316'},
    {label:'Very Poor',color:'#ef4444'}][aqi] || {label:'–',color:'#94a3b8'}
}
function fmt(unix) {
  return new Date(unix * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
}
function dayName(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { weekday:'short' })
}
function toF(c) { return Math.round(c * 9/5 + 32) }

function useTweenedValue(target) {
  const [display, setDisplay] = useState(target)
  const ref = useRef(target)
  useEffect(() => {
    const from = ref.current, to = target
    if (from === to) return
    const start = performance.now(), dur = 600
    function step(now) {
      const t = Math.min((now - start) / dur, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * ease))
      if (t < 1) requestAnimationFrame(step)
      else ref.current = to
    }
    requestAnimationFrame(step)
  }, [target])
  return display
}

// ── Micro-viz ─────────────────────────────────────────────────────────────────
function ArcGauge({ value, max, color, label, unit }) {
  const r = 28, cx = 40, cy = 44
  const angle = (value / max) * 180
  const rad = (a) => (a - 180) * Math.PI / 180
  const x2 = cx + r * Math.cos(rad(angle)), y2 = cy + r * Math.sin(rad(angle))
  const large = angle > 180 ? 1 : 0
  return (
    <svg width="80" height="52" viewBox="0 0 80 52" aria-label={label}>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 1 1 ${cx+r} ${cy}`}
        fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" strokeLinecap="round"/>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
        fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"/>
      <text x={cx} y={cy-4} textAnchor="middle" fill="white" fontSize="13" fontWeight="700">{value}</text>
      <text x={cx} y={cy+10} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="8">{unit}</text>
    </svg>
  )
}

function WindCompass({ deg, speed }) {
  const r = 26, rad = (deg - 90) * Math.PI / 180
  const nx = 32 + r * Math.cos(rad), ny = 32 + r * Math.sin(rad)
  return (
    <svg width="72" height="72" viewBox="0 0 64 64" aria-label={`Wind ${speed} km/h ${getWindDir(deg)}`}>
      <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
      {['N','E','S','W'].map((d,i) => {
        const a = i * 90 * Math.PI / 180
        return <text key={d} x={32+22*Math.sin(a)} y={32-22*Math.cos(a)+4}
          textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="7">{d}</text>
      })}
      <line x1="32" y1="32" x2={nx} y2={ny} stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx={nx} cy={ny} r="3" fill="#60a5fa"/>
      <circle cx="32" cy="32" r="3" fill="white" opacity="0.8"/>
    </svg>
  )
}

function SunArc({ sunrise, sunset }) {
  const now = Date.now() / 1000
  const progress = Math.max(0, Math.min(1, (now - sunrise) / (sunset - sunrise)))
  const r = 26, cx = 40, cy = 44
  const rad = (p) => Math.PI + p * Math.PI
  const px = cx + r * Math.cos(rad(progress)), py = cy + r * Math.sin(rad(progress))
  return (
    <svg width="88" height="52" viewBox="0 0 80 48" aria-label="Sun position">
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" strokeLinecap="round"/>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${px} ${py}`}
        fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round"/>
      <circle cx={px} cy={py} r="5" fill="#fbbf24"/>
      <text x={cx-r-2} y={cy+12} fill="rgba(255,255,255,0.5)" fontSize="7" textAnchor="middle">{fmt(sunrise)}</text>
      <text x={cx+r+2} y={cy+12} fill="rgba(255,255,255,0.5)" fontSize="7" textAnchor="middle">{fmt(sunset)}</text>
    </svg>
  )
}

function TempRangeBar({ days, unit }) {
  if (!days.length) return null
  const allTemps = days.flatMap(d => [d.temp_min, d.temp_max])
  const weekMin = Math.min(...allTemps), weekMax = Math.max(...allTemps)
  const range = weekMax - weekMin || 1
  const conv = t => unit === 'C' ? t : toF(t)
  return (
    <div className="range-bars">
      {days.map((day, i) => {
        const left = ((day.temp_min - weekMin) / range) * 100
        const width = ((day.temp_max - day.temp_min) / range) * 100
        return (
          <div className="range-row" key={i}>
            <span className="range-day">{dayName(day.dt)}</span>
            <WeatherIcon code={day.icon} size={22} className="range-icon"/>
            <span className="range-lo">{conv(day.temp_min)}°</span>
            <div className="range-track">
              <div className="range-fill" style={{ left:`${left}%`, width:`${Math.max(width,8)}%` }}/>
            </div>
            <span className="range-hi">{conv(day.temp_max)}°</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Clickable Glass Tile ───────────────────────────────────────────────────────
function GlassTile({ label, children, className = '', tileKey, onExpand }) {
  return (
    <div
      className={`glass-tile ${className} ${tileKey ? 'tile-clickable' : ''}`}
      onClick={() => tileKey && onExpand(tileKey)}
      onKeyDown={e => (e.key==='Enter'||e.key===' ') && tileKey && onExpand(tileKey)}
      tabIndex={tileKey ? 0 : undefined}
      role={tileKey ? 'button' : undefined}
      aria-label={tileKey ? `Expand ${label} details` : undefined}
    >
      <div className="tile-label">
        {label}
        {tileKey && <span className="tile-expand-hint" aria-hidden="true">↗</span>}
      </div>
      <div className="tile-body">{children}</div>
    </div>
  )
}

function SkeletonPulse() {
  return (
    <div className="skeleton-wrap">
      <div className="skel skel-hero"/>
      <div className="skel-row">{[0,1,2,3].map(i=><div key={i} className="skel skel-tile"/>)}</div>
      <div className="skel skel-chart"/>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef(null)
  const atmosRef = useRef(null)

  // View: 'globe' = landing, 'detail' = weather loaded
  const [view, setView] = useState('globe')
  const [activeTile, setActiveTile] = useState(null)
  const [globeFlyTo, setGlobeFlyTo] = useState(null)

  const [weather, setWeather] = useState(null)
  const [forecast, setForecast] = useState([])
  const [hourly, setHourly] = useState([])
  const [airQuality, setAirQuality] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [unit, setUnit] = useState('C')
  const [city, setCity] = useState('')
  const [copied, setCopied] = useState(false)
  const [themeKey, setThemeKey] = useState('clear-night')
  const [recentSearches, setRecentSearches] = useState(() =>
    JSON.parse(localStorage.getItem('recentSearches') || '[]'))
  const [favorites, setFavorites] = useState(() =>
    JSON.parse(localStorage.getItem('favorites') || '[]'))

  const rawTemp = weather ? Math.round(weather.main.temp) : 0
  const displayRaw = unit === 'C' ? rawTemp : toF(rawTemp)
  const tweenedTemp = useTweenedValue(displayRaw)
  const displayTemp = useCallback((t) =>
    unit === 'C' ? `${Math.round(t)}°` : `${toF(t)}°`, [unit])

  // Atmosphere canvas (only when in detail view)
  useEffect(() => {
    if (view !== 'detail') return
    if (!canvasRef.current) return
    if (atmosRef.current) return
    atmosRef.current = createAtmosphere(canvasRef.current)
    atmosRef.current.setCondition(themeKey)
    return () => { atmosRef.current?.destroy(); atmosRef.current = null }
  }, [view])

  useEffect(() => {
    if (atmosRef.current) atmosRef.current.setCondition(themeKey)
    const theme = THEMES[themeKey] || THEMES['clear-night']
    document.documentElement.style.setProperty('--atm-top', theme.top)
    document.documentElement.style.setProperty('--atm-bot', theme.bot)
  }, [themeKey])

  async function fetchWeather(query) {
    setLoading(true)
    setError('')
    try {
      const [wRes, fRes] = await Promise.all([
        fetch(`${API_BASE}/weather?${query}&appid=${API_KEY}&units=metric`),
        fetch(`${API_BASE}/forecast?${query}&appid=${API_KEY}&units=metric`)
      ])
      if (!wRes.ok) throw new Error((await wRes.json()).message || 'City not found')
      const wData = await wRes.json()
      const fData = await fRes.json()

      setWeather(wData)
      setView('detail')

      const { key } = resolveThemeKey(wData.weather[0].id, wData.sys.sunrise, wData.sys.sunset)
      setThemeKey(key)

      // Extended hourly — include humidity, pressure, wind for tile drawers
      setHourly(fData.list.slice(0, 8).map(item => ({
        time: new Date(item.dt * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        temp: Math.round(item.main.temp),
        tempF: toF(item.main.temp),
        pop: Math.round((item.pop || 0) * 100),
        humidity: item.main.humidity,
        pressure: item.main.pressure,
        windSpeed: Math.round((item.wind?.speed || 0) * 3.6),
        visibility: item.visibility,
      })))

      const daily = {}
      fData.list.forEach(item => {
        const d = new Date(item.dt * 1000).toDateString()
        if (!daily[d]) daily[d] = []
        daily[d].push(item)
      })
      setForecast(Object.entries(daily).slice(1, 6).map(([, items]) => {
        const temps = items.map(i => i.main.temp)
        const noon = items.find(i => new Date(i.dt*1000).getHours() === 12) || items[0]
        return {
          dt: noon.dt,
          temp_max: Math.round(Math.max(...temps)),
          temp_min: Math.round(Math.min(...temps)),
          icon: noon.weather[0].id,
          pop: Math.round((noon.pop || 0) * 100),
        }
      }))

      const { lat, lon } = wData.coord
      const aqRes = await fetch(`${API_BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`)
      if (aqRes.ok) setAirQuality((await aqRes.json()).list[0])

      const name = wData.name
      setRecentSearches(prev => {
        const up = [name, ...prev.filter(c => c !== name)].slice(0, 5)
        localStorage.setItem('recentSearches', JSON.stringify(up))
        return up
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch() {
    if (!city.trim()) return
    fetchWeather(`q=${encodeURIComponent(city.trim())}`)
  }

  function handleLocation() {
    if (!navigator.geolocation) return setError('Geolocation not supported.')
    navigator.geolocation.getCurrentPosition(
      p => fetchWeather(`lat=${p.coords.latitude}&lon=${p.coords.longitude}`),
      () => setError('Location access denied.')
    )
  }

  // Globe selects a location by lat/lng
  function handleGlobeSelect(lat, lng) {
    fetchWeather(`lat=${lat}&lon=${lng}`)
  }

  // Search while on globe — fly globe then fetch
  function handleSearchOnGlobe() {
    if (!city.trim()) return
    // First fly globe, then fetch
    fetchWeather(`q=${encodeURIComponent(city.trim())}`)
  }

  function toggleFav() {
    if (!weather) return
    const n = weather.name
    setFavorites(prev => {
      const up = prev.includes(n) ? prev.filter(c=>c!==n) : [...prev, n]
      localStorage.setItem('favorites', JSON.stringify(up))
      return up
    })
  }

  async function share() {
    if (!weather) return
    const text = `${weather.name}: ${tweenedTemp}°${unit}, ${weather.weather[0].description}`
    if (navigator.share) await navigator.share({ title:'WeatherNow', text })
    else { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),2000) }
  }

  const isNight = weather ? Date.now()/1000 > weather.sys.sunset : false
  const isFav = weather ? favorites.includes(weather.name) : false
  const condCode = weather?.weather[0].id || 800
  const windSpeed = weather ? Math.round(weather.wind.speed * 3.6) : 0

  return (
    <div className="app" data-theme={themeKey} data-view={view}>

      {/* ── GLOBE VIEW ── */}
      {view === 'globe' && (
        <div className="globe-screen">
          <Suspense fallback={
            <div className="globe-fallback">
              <div className="globe-shimmer-big"/>
            </div>
          }>
            <GlobeView
              onLocationSelect={handleGlobeSelect}
              unit={unit}
              searchFlyTo={globeFlyTo}
            />
          </Suspense>

          {/* Overlay UI */}
          <div className="globe-overlay">
            <header className="topbar">
              <div className="brand">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="5" fill="#fbbf24"/>
                  {[0,60,120,180,240,300].map(a=>(
                    <line key={a} x1="11" y1="2" x2="11" y2="4.5"
                      stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round"
                      transform={`rotate(${a} 11 11)`}/>
                  ))}
                </svg>
                <span>WeatherNow</span>
              </div>
              <div className="topbar-actions">
                <button className="pill-btn" onClick={()=>setUnit(u=>u==='C'?'F':'C')}
                  aria-label={`Switch to °${unit==='C'?'F':'C'}`}>°{unit==='C'?'F':'C'}</button>
              </div>
            </header>

            <div className="search-row">
              <div className="search-glass">
                <svg className="search-icon-svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input type="text" placeholder="Search city…" value={city}
                  onChange={e=>setCity(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleSearchOnGlobe()}
                  aria-label="City search"/>
                <button className="search-submit" onClick={handleSearchOnGlobe}>Search</button>
              </div>
              <button className="loc-btn" onClick={handleLocation} aria-label="Use current location">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="9" y1="1" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="9" y1="13" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="1" y1="9" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="13" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {(recentSearches.length > 0 || favorites.length > 0) && (
              <div className="chips-row">
                {favorites.map(c=>(
                  <button key={`f-${c}`} className="chip chip-fav"
                    onClick={()=>{setCity(c);fetchWeather(`q=${c}`)}}>★ {c}</button>
                ))}
                {recentSearches.filter(c=>!favorites.includes(c)).map(c=>(
                  <button key={`r-${c}`} className="chip"
                    onClick={()=>{setCity(c);fetchWeather(`q=${c}`)}}>{c}</button>
                ))}
              </div>
            )}

            {error && (
              <div className="state-card error-card" role="alert">
                <div className="state-icon">⚠</div>
                <div><strong>Couldn't load weather</strong><p>{error}</p></div>
              </div>
            )}

            {loading && (
              <div className="globe-loading-bar">
                <div className="globe-loading-fill"/>
              </div>
            )}

            <div className="globe-headline" aria-live="polite">
              <h1>Feel the weather,<br/>anywhere.</h1>
              <p>Spin the globe · click any country · search above</p>
            </div>
          </div>
        </div>
      )}

      {/* ── DETAIL VIEW ── */}
      {view === 'detail' && (
        <>
          <canvas ref={canvasRef} className="atm-canvas" aria-hidden="true"/>
          <div className="atm-scrim" aria-hidden="true"/>

          <div className="shell">
            <header className="topbar">
              <div className="brand">
                <button className="back-btn" onClick={()=>{setView('globe');setWeather(null)}}
                  aria-label="Back to globe">
                  ← Globe
                </button>
              </div>
              <div className="topbar-actions">
                <button className="pill-btn" onClick={()=>setUnit(u=>u==='C'?'F':'C')}
                  aria-label={`Switch to °${unit==='C'?'F':'C'}`}>°{unit==='C'?'F':'C'}</button>
                <button className={`icon-btn ${isFav?'active':''}`} onClick={toggleFav}
                  aria-label={isFav?'Remove favourite':'Add favourite'}>{isFav?'★':'☆'}</button>
                <button className="icon-btn" onClick={share}
                  aria-label="Share">{copied?'✓':'↑'}</button>
              </div>
            </header>

            <div className="search-row">
              <div className="search-glass">
                <svg className="search-icon-svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input type="text" placeholder="Search city…" value={city}
                  onChange={e=>setCity(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleSearch()}
                  aria-label="City search"/>
                <button className="search-submit" onClick={handleSearch}>Search</button>
              </div>
              <button className="loc-btn" onClick={handleLocation} aria-label="Use current location">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="9" y1="1" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="9" y1="13" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="1" y1="9" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="13" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {(recentSearches.length > 0 || favorites.length > 0) && !loading && (
              <div className="chips-row">
                {favorites.map(c=>(
                  <button key={`f-${c}`} className="chip chip-fav"
                    onClick={()=>{setCity(c);fetchWeather(`q=${c}`)}}>★ {c}</button>
                ))}
                {recentSearches.filter(c=>!favorites.includes(c)).map(c=>(
                  <button key={`r-${c}`} className="chip"
                    onClick={()=>{setCity(c);fetchWeather(`q=${c}`)}}>{c}</button>
                ))}
              </div>
            )}

            {error && (
              <div className="state-card error-card" role="alert">
                <div className="state-icon">⚠</div>
                <div><strong>Couldn't load weather</strong><p>{error}</p></div>
              </div>
            )}

            {loading && <SkeletonPulse/>}

            {weather && !loading && (
              <div className="content">
                {/* Hero */}
                <div className="hero">
                  <div className="hero-left">
                    <div className="hero-location">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M7 1C4.79 1 3 2.79 3 5c0 3.25 4 8 4 8s4-4.75 4-8c0-2.21-1.79-4-4-4z" fill="currentColor" opacity="0.7"/>
                      </svg>
                      {weather.name}, {weather.sys.country}
                    </div>
                    <div className="hero-date">
                      {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
                    </div>
                    <div className="hero-temp" aria-live="polite" aria-label={`Temperature ${tweenedTemp} degrees ${unit}`}>
                      {tweenedTemp}<span className="hero-unit">°{unit}</span>
                    </div>
                    <div className="hero-desc">{weather.weather[0].description}</div>
                    <div className="hero-meta">
                      <span>Feels {displayTemp(weather.main.feels_like)}{unit}</span>
                      <span className="dot">·</span>
                      <span>H:{displayTemp(weather.main.temp_max)}{unit}</span>
                      <span className="dot">·</span>
                      <span>L:{displayTemp(weather.main.temp_min)}{unit}</span>
                    </div>
                  </div>
                  <div className="hero-icon-wrap">
                    <WeatherIcon code={condCode} isNight={isNight} size={120} className="hero-weather-icon"/>
                  </div>
                </div>

                {/* Hourly */}
                {hourly.length > 0 && (
                  <div className="section-glass">
                    <div className="section-head">24 · Hour Forecast</div>
                    <div className="hourly-chart">
                      <ResponsiveContainer width="100%" height={140}>
                        <AreaChart data={hourly} margin={{top:16,right:8,left:8,bottom:0}}>
                          <defs>
                            <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="time" tick={{fill:'rgba(255,255,255,0.55)',fontSize:10}} axisLine={false} tickLine={false}/>
                          <Tooltip
                            contentStyle={{background:'rgba(15,15,30,0.85)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,color:'white',fontSize:12}}
                            formatter={v=>[`${v}°${unit}`,'Temp']}/>
                          <Area type="monotone" dataKey={unit==='C'?'temp':'tempF'} stroke="#60a5fa" strokeWidth={2} fill="url(#hg)" dot={{fill:'#60a5fa',r:3,strokeWidth:0}}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 5-day */}
                {forecast.length > 0 && (
                  <div className="section-glass">
                    <div className="section-head">5 · Day Forecast</div>
                    <TempRangeBar days={forecast} unit={unit}/>
                  </div>
                )}

                {/* Tiles */}
                <div className="tiles-grid">
                  <GlassTile label="Humidity" tileKey="humidity" onExpand={setActiveTile}>
                    <ArcGauge value={weather.main.humidity} max={100} color="#60a5fa" label="Humidity" unit="%"/>
                  </GlassTile>

                  <GlassTile label="Wind" tileKey="wind" onExpand={setActiveTile}>
                    <WindCompass deg={weather.wind.deg||0} speed={windSpeed}/>
                    <div className="tile-stat">{windSpeed} <span>km/h</span></div>
                  </GlassTile>

                  <GlassTile label="Sun" className="tile-wide" tileKey="sun" onExpand={setActiveTile}>
                    <SunArc sunrise={weather.sys.sunrise} sunset={weather.sys.sunset}/>
                  </GlassTile>

                  <GlassTile label="Pressure" tileKey="pressure" onExpand={setActiveTile}>
                    <ArcGauge value={weather.main.pressure} max={1050} color="#a78bfa" label="Pressure" unit="hPa"/>
                  </GlassTile>

                  <GlassTile label="Visibility" tileKey="visibility" onExpand={setActiveTile}>
                    <div className="tile-big">{(weather.visibility/1000).toFixed(1)}</div>
                    <div className="tile-sub">km</div>
                  </GlassTile>

                  <GlassTile label="Cloud Cover">
                    <ArcGauge value={weather.clouds.all} max={100} color="#94a3b8" label="Cloud cover" unit="%"/>
                  </GlassTile>

                  {airQuality && (
                    <GlassTile label="Air Quality" className="tile-wide" tileKey="aqi" onExpand={setActiveTile}>
                      <div className="aqi-row">
                        <div className="aqi-track">
                          {[1,2,3,4,5].map(n=>(
                            <div key={n} className="aqi-seg"
                              style={{background:getAQIInfo(n).color, opacity:airQuality.main.aqi===n?1:0.25}}/>
                          ))}
                        </div>
                        <span className="aqi-label" style={{color:getAQIInfo(airQuality.main.aqi).color}}>
                          {getAQIInfo(airQuality.main.aqi).label}
                        </span>
                      </div>
                      <div className="aqi-components">
                        {[['PM2.5',airQuality.components.pm2_5],['PM10',airQuality.components.pm10],
                          ['NO₂',airQuality.components.no2],['O₃',airQuality.components.o3]].map(([k,v])=>(
                          <div key={k} className="aqi-cmp"><span>{k}</span><strong>{v.toFixed(1)}</strong></div>
                        ))}
                      </div>
                    </GlassTile>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tile Drawer ── */}
      {activeTile && weather && (
        <TileDrawer
          tile={activeTile}
          weather={weather}
          hourly={hourly}
          airQuality={airQuality}
          unit={unit}
          onClose={() => setActiveTile(null)}
        />
      )}
    </div>
  )
}
