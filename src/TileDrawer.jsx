/**
 * TileDrawer.jsx — Expandable detail drawer for each gauge tile.
 * Slides up from the tile, keyboard-accessible, closes on Esc.
 */
import { useEffect, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

function fmt(unix) {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function toF(c) { return Math.round(c * 9/5 + 32) }

function getAQIInfo(aqi) {
  return [{},{label:'Good',color:'#34d399',note:'Air quality is satisfactory.'},
    {label:'Fair',color:'#a3e635',note:'Acceptable; some pollutants may affect very sensitive people.'},
    {label:'Moderate',color:'#fbbf24',note:'Sensitive groups may experience effects.'},
    {label:'Poor',color:'#f97316',note:'Everyone may begin to experience health effects.'},
    {label:'Very Poor',color:'#ef4444',note:'Health warnings — everyone may experience serious effects.'}
  ][aqi] || {label:'–',color:'#94a3b8',note:''}
}

function getWindDir(deg) {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8]
}

const CHART_STYLE = {
  contentStyle: {
    background: 'rgba(10,15,35,0.9)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: 'white',
    fontSize: 12,
    backdropFilter: 'blur(10px)'
  }
}

// ── Individual drawer contents ────────────────────────────────────────────────

function WindDetail({ weather, hourly, unit }) {
  const speed = Math.round(weather.wind.speed * 3.6)
  const gust = weather.wind.gust ? Math.round(weather.wind.gust * 3.6) : null
  const dir = getWindDir(weather.wind.deg || 0)
  const windData = hourly.map(h => ({ time: h.time, speed: h.windSpeed || speed }))
  return (
    <div className="drawer-content">
      <div className="drawer-stats-row">
        <div className="dstat"><span>Speed</span><strong>{speed} km/h</strong></div>
        <div className="dstat"><span>Direction</span><strong>{dir} ({weather.wind.deg || 0}°)</strong></div>
        {gust && <div className="dstat"><span>Gusts</span><strong>{gust} km/h</strong></div>}
      </div>
      <div className="drawer-chart-title">Wind Speed — Next 24h</div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={windData}>
          <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
          </linearGradient></defs>
          <XAxis dataKey="time" tick={{fill:'rgba(255,255,255,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
          <Tooltip {...CHART_STYLE} formatter={v=>[`${v} km/h`,'Speed']}/>
          <Area type="monotone" dataKey="speed" stroke="#60a5fa" strokeWidth={2} fill="url(#wg)" dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function HumidityDetail({ weather, hourly }) {
  const dew = (weather.main.temp - ((100 - weather.main.humidity) / 5)).toFixed(1)
  const data = hourly.map(h => ({ time: h.time, humidity: h.humidity || weather.main.humidity }))
  return (
    <div className="drawer-content">
      <div className="drawer-stats-row">
        <div className="dstat"><span>Current</span><strong>{weather.main.humidity}%</strong></div>
        <div className="dstat"><span>Dew Point</span><strong>{dew}°C</strong></div>
      </div>
      <div className="drawer-chart-title">Humidity — Next 24h</div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data}>
          <defs><linearGradient id="humg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
          </linearGradient></defs>
          <XAxis dataKey="time" tick={{fill:'rgba(255,255,255,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
          <Tooltip {...CHART_STYLE} formatter={v=>[`${v}%`,'Humidity']}/>
          <Area type="monotone" dataKey="humidity" stroke="#38bdf8" strokeWidth={2} fill="url(#humg)" dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function PressureDetail({ weather, hourly }) {
  const data = hourly.map(h => ({ time: h.time, pressure: h.pressure || weather.main.pressure }))
  const values = data.map(d => d.pressure)
  const trend = values[values.length-1] > values[0] ? '↑ Rising' : values[values.length-1] < values[0] ? '↓ Falling' : '→ Steady'
  const trendColor = trend.startsWith('↑') ? '#34d399' : trend.startsWith('↓') ? '#f87171' : '#94a3b8'
  return (
    <div className="drawer-content">
      <div className="drawer-stats-row">
        <div className="dstat"><span>Pressure</span><strong>{weather.main.pressure} hPa</strong></div>
        <div className="dstat"><span>Trend</span><strong style={{color:trendColor}}>{trend}</strong></div>
        <div className="dstat"><span>Sea Level</span><strong>{weather.main.sea_level || weather.main.pressure} hPa</strong></div>
      </div>
      <div className="drawer-chart-title">Pressure — Next 24h</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data}>
          <XAxis dataKey="time" tick={{fill:'rgba(255,255,255,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
          <YAxis domain={['auto','auto']} hide/>
          <Tooltip {...CHART_STYLE} formatter={v=>[`${v} hPa`,'Pressure']}/>
          <Line type="monotone" dataKey="pressure" stroke="#a78bfa" strokeWidth={2} dot={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function SunDetail({ weather }) {
  const rise = weather.sys.sunrise
  const set = weather.sys.sunset
  const now = Date.now() / 1000
  const dayLen = set - rise
  const hours = Math.floor(dayLen / 3600)
  const mins = Math.floor((dayLen % 3600) / 60)
  const noon = rise + dayLen / 2
  const progress = Math.max(0, Math.min(1, (now - rise) / dayLen))
  const r = 80, cx = 120, cy = 120
  const toPoint = (p) => {
    const angle = Math.PI + p * Math.PI
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }
  const sunPos = toPoint(progress)
  return (
    <div className="drawer-content">
      <div className="drawer-stats-row">
        <div className="dstat"><span>Sunrise</span><strong>{fmt(rise)}</strong></div>
        <div className="dstat"><span>Solar Noon</span><strong>{fmt(noon)}</strong></div>
        <div className="dstat"><span>Sunset</span><strong>{fmt(set)}</strong></div>
        <div className="dstat"><span>Day Length</span><strong>{hours}h {mins}m</strong></div>
      </div>
      <div style={{display:'flex',justifyContent:'center',marginTop:12}}>
        <svg width="240" height="140" viewBox="0 0 240 140" aria-label="Sun arc">
          <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
            fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" strokeLinecap="round"/>
          <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${sunPos.x} ${sunPos.y}`}
            fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round"/>
          <circle cx={sunPos.x} cy={sunPos.y} r="10" fill="#fbbf24"
            filter="url(#sun-glow-big)"/>
          <defs>
            <filter id="sun-glow-big">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <text x={cx-r-4} y={cy+18} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">{fmt(rise)}</text>
          <text x={cx+r+4} y={cy+18} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">{fmt(set)}</text>
          <text x={cx} y={cy+18} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">Noon {fmt(noon)}</text>
        </svg>
      </div>
    </div>
  )
}

function VisibilityDetail({ weather, hourly }) {
  const data = hourly.map(h => ({ time: h.time, vis: h.visibility != null ? h.visibility/1000 : weather.visibility/1000 }))
  const current = (weather.visibility/1000).toFixed(1)
  const quality = weather.visibility >= 10000 ? 'Clear' : weather.visibility >= 5000 ? 'Good' : weather.visibility >= 1000 ? 'Moderate' : 'Poor'
  return (
    <div className="drawer-content">
      <div className="drawer-stats-row">
        <div className="dstat"><span>Visibility</span><strong>{current} km</strong></div>
        <div className="dstat"><span>Condition</span><strong>{quality}</strong></div>
        <div className="dstat"><span>Cloud Cover</span><strong>{weather.clouds.all}%</strong></div>
      </div>
      <div className="drawer-chart-title">Visibility Trend — Next 24h</div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data}>
          <defs><linearGradient id="visg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
          </linearGradient></defs>
          <XAxis dataKey="time" tick={{fill:'rgba(255,255,255,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
          <Tooltip {...CHART_STYLE} formatter={v=>[`${v} km`,'Visibility']}/>
          <Area type="monotone" dataKey="vis" stroke="#94a3b8" strokeWidth={2} fill="url(#visg)" dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function AQIDetail({ airQuality, hourly }) {
  if (!airQuality) return <div className="drawer-content"><p style={{color:'rgba(255,255,255,0.5)'}}>No AQI data available.</p></div>
  const info = getAQIInfo(airQuality.main.aqi)
  const comps = [
    ['PM2.5', airQuality.components.pm2_5, 'μg/m³'],
    ['PM10',  airQuality.components.pm10,  'μg/m³'],
    ['NO₂',   airQuality.components.no2,   'μg/m³'],
    ['O₃',    airQuality.components.o3,    'μg/m³'],
    ['SO₂',   airQuality.components.so2,   'μg/m³'],
    ['CO',    airQuality.components.co/1000,'mg/m³'],
  ]
  return (
    <div className="drawer-content">
      <div className="aqi-big-label" style={{color:info.color}}>
        {info.label}
        <span className="aqi-note">{info.note}</span>
      </div>
      <div className="aqi-full-track">
        {[1,2,3,4,5].map(n => {
          const i = getAQIInfo(n)
          return (
            <div key={n} className="aqi-full-seg"
              style={{background:i.color, opacity:airQuality.main.aqi===n?1:0.25}}>
              <span>{i.label}</span>
            </div>
          )
        })}
      </div>
      <div className="aqi-comps-grid">
        {comps.map(([k,v,u]) => (
          <div key={k} className="aqi-comp-card">
            <span className="aqi-comp-name">{k}</span>
            <strong className="aqi-comp-val">{typeof v === 'number' ? v.toFixed(2) : '–'}</strong>
            <span className="aqi-comp-unit">{u}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main TileDrawer ───────────────────────────────────────────────────────────
const TITLES = {
  wind: 'Wind',
  humidity: 'Humidity',
  pressure: 'Pressure',
  sun: 'Sun & Daylight',
  visibility: 'Visibility & Clouds',
  aqi: 'Air Quality',
}

export default function TileDrawer({ tile, weather, hourly, airQuality, unit, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true"
      aria-label={TITLES[tile]} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="drawer-panel" ref={ref} tabIndex={-1}>
        <div className="drawer-header">
          <span className="drawer-title">{TITLES[tile]}</span>
          <button className="drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {tile === 'wind'       && <WindDetail weather={weather} hourly={hourly} unit={unit}/>}
        {tile === 'humidity'   && <HumidityDetail weather={weather} hourly={hourly}/>}
        {tile === 'pressure'   && <PressureDetail weather={weather} hourly={hourly}/>}
        {tile === 'sun'        && <SunDetail weather={weather}/>}
        {tile === 'visibility' && <VisibilityDetail weather={weather} hourly={hourly}/>}
        {tile === 'aqi'        && <AQIDetail airQuality={airQuality} hourly={hourly}/>}
      </div>
    </div>
  )
}
