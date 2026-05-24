import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY || '1de5a2ec29141f30436323f5aedf3848'
const API_BASE = 'https://api.openweathermap.org/data/2.5'

function getWeatherIcon(code, isNight = false) {
  if (code >= 200 && code < 300) return '⛈️'
  if (code >= 300 && code < 400) return '🌦️'
  if (code >= 500 && code < 600) return '🌧️'
  if (code >= 600 && code < 700) return '❄️'
  if (code >= 700 && code < 800) return '🌫️'
  if (code === 800) return isNight ? '🌙' : '☀️'
  if (code === 801) return isNight ? '🌤️' : '🌤️'
  if (code === 802) return '⛅'
  if (code >= 803) return '☁️'
  return '🌡️'
}

function getWindDir(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

function getAQIInfo(aqi) {
  const map = {
    1: { label: 'Good', color: '#34d399' },
    2: { label: 'Fair', color: '#a3e635' },
    3: { label: 'Moderate', color: '#fbbf24' },
    4: { label: 'Poor', color: '#f97316' },
    5: { label: 'Very Poor', color: '#ef4444' },
  }
  return map[aqi] || { label: 'Unknown', color: '#94a3b8' }
}

function getBgClass(code) {
  if (code >= 200 && code < 300) return 'bg-storm'
  if (code >= 300 && code < 600) return 'bg-rain'
  if (code >= 600 && code < 700) return 'bg-snow'
  if (code >= 700 && code < 800) return 'bg-fog'
  if (code === 800) return 'bg-sunny'
  return 'bg-cloudy'
}

function formatTime(unix) {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getDayName(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { weekday: 'short' })
}

function toF(c) { return Math.round(c * 9 / 5 + 32) }

export default function App() {
  const [weather, setWeather] = useState(null)
  const [forecast, setForecast] = useState([])
  const [hourly, setHourly] = useState([])
  const [airQuality, setAirQuality] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState('dark')
  const [unit, setUnit] = useState('C')
  const [city, setCity] = useState('')
  const [copied, setCopied] = useState(false)
  const [recentSearches, setRecentSearches] = useState(() =>
    JSON.parse(localStorage.getItem('recentSearches') || '[]')
  )
  const [favorites, setFavorites] = useState(() =>
    JSON.parse(localStorage.getItem('favorites') || '[]')
  )

  useEffect(() => {
    document.body.className = theme === 'light' ? 'light' : ''
  }, [theme])

  const displayTemp = (t) => unit === 'C' ? `${Math.round(t)}°C` : `${toF(t)}°F`

  async function fetchWeather(query) {
    setLoading(true)
    setError('')
    setWeather(null)
    setForecast([])
    setHourly([])
    setAirQuality(null)

    try {
      const [wRes, fRes] = await Promise.all([
        fetch(`${API_BASE}/weather?${query}&appid=${API_KEY}&units=metric`),
        fetch(`${API_BASE}/forecast?${query}&appid=${API_KEY}&units=metric`)
      ])

      if (!wRes.ok) {
        const err = await wRes.json()
        throw new Error(err.message || 'City not found')
      }

      const wData = await wRes.json()
      const fData = await fRes.json()

      setWeather(wData)

      // Hourly (next 24h = 8 items)
      const hourlyData = fData.list.slice(0, 8).map(item => ({
        time: new Date(item.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        temp: Math.round(item.main.temp),
        tempF: toF(item.main.temp)
      }))
      setHourly(hourlyData)

      // 5-day forecast
      const daily = {}
      fData.list.forEach(item => {
        const date = new Date(item.dt * 1000).toDateString()
        if (!daily[date]) daily[date] = []
        daily[date].push(item)
      })
      const dailyForecast = Object.entries(daily).slice(1, 6).map(([, items]) => {
        const temps = items.map(i => i.main.temp)
        const noon = items.find(i => new Date(i.dt * 1000).getHours() === 12) || items[0]
        return {
          dt: noon.dt,
          temp_max: Math.round(Math.max(...temps)),
          temp_min: Math.round(Math.min(...temps)),
          icon: noon.weather[0].id,
        }
      })
      setForecast(dailyForecast)

      // Air Quality using lat/lon
      const { lat, lon } = wData.coord
      const aqRes = await fetch(`${API_BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`)
      if (aqRes.ok) {
        const aqData = await aqRes.json()
        setAirQuality(aqData.list[0])
      }

      // Save to recent searches
      const name = wData.name
      setRecentSearches(prev => {
        const updated = [name, ...prev.filter(c => c !== name)].slice(0, 5)
        localStorage.setItem('recentSearches', JSON.stringify(updated))
        return updated
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

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
  }

  function handleLocation() {
    if (!navigator.geolocation) return setError('Geolocation not supported.')
    navigator.geolocation.getCurrentPosition(
      pos => fetchWeather(`lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`),
      () => setError('Unable to get your location.')
    )
  }

  function toggleFavorite() {
    if (!weather) return
    const name = weather.name
    setFavorites(prev => {
      const updated = prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
      localStorage.setItem('favorites', JSON.stringify(updated))
      return updated
    })
  }

  async function shareWeather() {
    if (!weather) return
    const text = `Weather in ${weather.name}: ${displayTemp(weather.main.temp)}, ${weather.weather[0].description}. Humidity: ${weather.main.humidity}%`
    if (navigator.share) {
      await navigator.share({ title: 'WeatherNow', text })
    } else {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isNight = weather ? Date.now() / 1000 > weather.sys.sunset : false
  const bgClass = weather ? getBgClass(weather.weather[0].id) : ''
  const isFav = weather ? favorites.includes(weather.name) : false

  return (
    <div className={`app ${bgClass}`}>
      {/* Header */}
      <div className="header">
        <h1>⛅ WeatherNow</h1>
        <div className="header-controls">
          <button className="unit-btn" onClick={() => setUnit(u => u === 'C' ? 'F' : 'C')}>
            °{unit === 'C' ? 'F' : 'C'}
          </button>
          <button className="theme-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="search-container">
        <input
          type="text"
          placeholder="Search city... (e.g. Chennai, London, Tokyo)"
          value={city}
          onChange={e => setCity(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="search-btn" onClick={handleSearch}>Search</button>
        <button className="location-btn" onClick={handleLocation} title="Use my location">📍</button>
      </div>

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <div className="recent-searches">
          <span className="recent-label">Recent:</span>
          {recentSearches.map(c => (
            <button key={c} className="recent-chip" onClick={() => { setCity(c); fetchWeather(`q=${c}`) }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Favorites */}
      {favorites.length > 0 && (
        <div className="favorites-bar">
          <span className="recent-label">⭐ Favorites:</span>
          {favorites.map(c => (
            <button key={c} className="fav-chip" onClick={() => { setCity(c); fetchWeather(`q=${c}`) }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && <div className="error-msg">⚠️ {error}</div>}

      {/* Loading */}
      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          Fetching weather data...
        </div>
      )}

      {/* Weather Data */}
      {weather && !loading && (
        <>
          {/* Main Card */}
          <div className={`weather-main ${bgClass}-card`}>
            <div className="weather-left">
              <div className="city-row">
                <div className="city-name">{weather.name}, {weather.sys.country}</div>
                <button className={`fav-btn ${isFav ? 'active' : ''}`} onClick={toggleFavorite} title="Favorite">
                  {isFav ? '⭐' : '☆'}
                </button>
                <button className="share-btn" onClick={shareWeather} title="Share">
                  {copied ? '✅' : '🔗'}
                </button>
              </div>
              <div className="weather-date">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <div className="temperature">{displayTemp(weather.main.temp)}</div>
              <div className="feels-like">
                Feels like {displayTemp(weather.main.feels_like)} &bull; {weather.weather[0].description}
              </div>
              <div className="temp-range">
                H: {displayTemp(weather.main.temp_max)} &nbsp; L: {displayTemp(weather.main.temp_min)}
              </div>
            </div>
            <div className="weather-right">
              <div className="weather-icon">{getWeatherIcon(weather.weather[0].id, isNight)}</div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="details-grid">
            <div className="detail-card">
              <div className="detail-icon">💧</div>
              <div className="detail-label">Humidity</div>
              <div className="detail-value">{weather.main.humidity}%</div>
            </div>
            <div className="detail-card">
              <div className="detail-icon">💨</div>
              <div className="detail-label">Wind</div>
              <div className="detail-value">{Math.round(weather.wind.speed * 3.6)} km/h {getWindDir(weather.wind.deg)}</div>
            </div>
            <div className="detail-card">
              <div className="detail-icon">🌡️</div>
              <div className="detail-label">Pressure</div>
              <div className="detail-value">{weather.main.pressure} hPa</div>
            </div>
            <div className="detail-card">
              <div className="detail-icon">👁️</div>
              <div className="detail-label">Visibility</div>
              <div className="detail-value">{(weather.visibility / 1000).toFixed(1)} km</div>
            </div>
            <div className="detail-card">
              <div className="detail-icon">🌅</div>
              <div className="detail-label">Sunrise</div>
              <div className="detail-value">{formatTime(weather.sys.sunrise)}</div>
            </div>
            <div className="detail-card">
              <div className="detail-icon">🌇</div>
              <div className="detail-label">Sunset</div>
              <div className="detail-value">{formatTime(weather.sys.sunset)}</div>
            </div>
            <div className="detail-card">
              <div className="detail-icon">☁️</div>
              <div className="detail-label">Cloud Cover</div>
              <div className="detail-value">{weather.clouds.all}%</div>
            </div>
            {airQuality && (
              <div className="detail-card">
                <div className="detail-icon">🌿</div>
                <div className="detail-label">Air Quality</div>
                <div className="detail-value" style={{ color: getAQIInfo(airQuality.main.aqi).color }}>
                  {getAQIInfo(airQuality.main.aqi).label}
                </div>
              </div>
            )}
          </div>

          {/* Air Quality Details */}
          {airQuality && (
            <div className="aqi-card">
              <div className="section-title">🌿 Air Quality Index</div>
              <div className="aqi-bar-container">
                <div className="aqi-bar">
                  <div
                    className="aqi-fill"
                    style={{
                      width: `${(airQuality.main.aqi / 5) * 100}%`,
                      background: getAQIInfo(airQuality.main.aqi).color
                    }}
                  ></div>
                </div>
                <span style={{ color: getAQIInfo(airQuality.main.aqi).color, fontWeight: 700 }}>
                  {getAQIInfo(airQuality.main.aqi).label}
                </span>
              </div>
              <div className="aqi-components">
                <div className="aqi-item"><span>PM2.5</span><strong>{airQuality.components.pm2_5.toFixed(1)}</strong></div>
                <div className="aqi-item"><span>PM10</span><strong>{airQuality.components.pm10.toFixed(1)}</strong></div>
                <div className="aqi-item"><span>NO₂</span><strong>{airQuality.components.no2.toFixed(1)}</strong></div>
                <div className="aqi-item"><span>O₃</span><strong>{airQuality.components.o3.toFixed(1)}</strong></div>
              </div>
            </div>
          )}

          {/* Hourly Chart */}
          {hourly.length > 0 && (
            <div className="chart-card">
              <div className="section-title">⏱️ 24-Hour Forecast</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={hourly}>
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f8ef7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fill: 'var(--subtext)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                    formatter={(val) => [`${val}°${unit}`, 'Temp']}
                  />
                  <Area
                    type="monotone"
                    dataKey={unit === 'C' ? 'temp' : 'tempF'}
                    stroke="#4f8ef7"
                    strokeWidth={2}
                    fill="url(#tempGrad)"
                    dot={{ fill: '#4f8ef7', r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 5-Day Forecast */}
          {forecast.length > 0 && (
            <>
              <div className="section-title">📅 5-Day Forecast</div>
              <div className="forecast-grid">
                {forecast.map((day, i) => (
                  <div className="forecast-card" key={i}>
                    <div className="forecast-day">{getDayName(day.dt)}</div>
                    <div className="forecast-icon">{getWeatherIcon(day.icon)}</div>
                    <div className="forecast-temp-high">{unit === 'C' ? `${day.temp_max}°C` : `${toF(day.temp_max)}°F`}</div>
                    <div className="forecast-temp-low">{unit === 'C' ? `${day.temp_min}°C` : `${toF(day.temp_min)}°F`}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Welcome */}
      {!weather && !loading && !error && (
        <div className="welcome">
          <div className="welcome-icon">🌍</div>
          <h2>Check the Weather Anywhere</h2>
          <p>Search a city or use your current location to get started.</p>
        </div>
      )}
    </div>
  )
}
