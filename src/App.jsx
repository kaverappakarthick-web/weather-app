import { useState, useEffect } from 'react'
import './App.css'

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY
const API_BASE = 'https://api.openweathermap.org/data/2.5'

function getWeatherIcon(code) {
  if (code >= 200 && code < 300) return '⛈️'
  if (code >= 300 && code < 400) return '🌦️'
  if (code >= 500 && code < 600) return '🌧️'
  if (code >= 600 && code < 700) return '❄️'
  if (code >= 700 && code < 800) return '🌫️'
  if (code === 800) return '☀️'
  if (code === 801) return '🌤️'
  if (code === 802) return '⛅'
  if (code >= 803) return '☁️'
  return '🌡️'
}

function getDayName(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { weekday: 'short' })
}

export default function App() {
  const [city, setCity] = useState('')
  const [weather, setWeather] = useState(null)
  const [forecast, setForecast] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    document.body.className = theme === 'light' ? 'light' : ''
  }, [theme])

  async function fetchWeather(query) {
    setLoading(true)
    setError('')
    setWeather(null)
    setForecast([])
    try {
      const [weatherRes, forecastRes] = await Promise.all([
        fetch(`${API_BASE}/weather?${query}&appid=${API_KEY}&units=metric`),
        fetch(`${API_BASE}/forecast?${query}&appid=${API_KEY}&units=metric`)
      ])

      if (!weatherRes.ok) {
        const err = await weatherRes.json()
        throw new Error(err.message || 'City not found')
      }

      const weatherData = await weatherRes.json()
      const forecastData = await forecastRes.json()

      setWeather(weatherData)

      // Get one forecast per day (noon reading)
      const daily = {}
      forecastData.list.forEach(item => {
        const date = new Date(item.dt * 1000).toDateString()
        if (!daily[date]) daily[date] = []
        daily[date].push(item)
      })

      const dailyForecast = Object.entries(daily)
        .slice(1, 6)
        .map(([, items]) => {
          const temps = items.map(i => i.main.temp)
          const noon = items.find(i => new Date(i.dt * 1000).getHours() === 12) || items[0]
          return {
            dt: noon.dt,
            temp_max: Math.round(Math.max(...temps)),
            temp_min: Math.round(Math.min(...temps)),
            icon: noon.weather[0].id,
            desc: noon.weather[0].description
          }
        })

      setForecast(dailyForecast)
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
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        fetchWeather(`lat=${latitude}&lon=${longitude}`)
      },
      () => setError('Unable to retrieve your location.')
    )
  }

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1>⛅ WeatherNow</h1>
        <button className="theme-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Search */}
      <div className="search-container">
        <input
          type="text"
          placeholder="Search city... (e.g. London, Tokyo, New York)"
          value={city}
          onChange={e => setCity(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="search-btn" onClick={handleSearch}>Search</button>
        <button className="location-btn" onClick={handleLocation} title="Use my location">📍</button>
      </div>

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
          <div className="weather-main">
            <div className="weather-left">
              <div className="city-name">{weather.name}</div>
              <div className="country">{weather.sys.country} &bull; {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div className="temperature">{Math.round(weather.main.temp)}°C</div>
              <div className="feels-like">Feels like {Math.round(weather.main.feels_like)}°C</div>
            </div>
            <div className="weather-right">
              <div className="weather-icon">{getWeatherIcon(weather.weather[0].id)}</div>
              <div className="weather-desc">{weather.weather[0].description}</div>
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
              <div className="detail-label">Wind Speed</div>
              <div className="detail-value">{Math.round(weather.wind.speed * 3.6)} km/h</div>
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
          </div>

          {/* 5-Day Forecast */}
          {forecast.length > 0 && (
            <>
              <div className="forecast-title">5-Day Forecast</div>
              <div className="forecast-grid">
                {forecast.map((day, i) => (
                  <div className="forecast-card" key={i}>
                    <div className="forecast-day">{getDayName(day.dt)}</div>
                    <div className="forecast-icon">{getWeatherIcon(day.icon)}</div>
                    <div className="forecast-temp-high">{day.temp_max}°C</div>
                    <div className="forecast-temp-low">{day.temp_min}°C</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Welcome screen */}
      {!weather && !loading && !error && (
        <div className="welcome">
          <div className="welcome-icon">🌍</div>
          <h2>Check the Weather Anywhere</h2>
          <p>Search for a city or use your current location to get started.</p>
        </div>
      )}
    </div>
  )
}
