/**
 * Globe.jsx — Interactive 3D temperature globe (globe.gl, dynamically imported)
 * Lazy-loads globe.gl + world-atlas topojson so the initial bundle stays small.
 * Temperature data from Open-Meteo (free, no key, CORS-enabled).
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Temperature → RGBA color ──────────────────────────────────────────────────
export function tempToColor(c, alpha = 0.82) {
  if (c == null) return `rgba(40,55,80,${alpha})`
  const t = Math.max(-30, Math.min(45, c))
  const n = (t + 30) / 75
  let r, g, b
  if (n < 0.2)      { const f=n/0.2;       r=Math.round(10+f*20);   g=Math.round(30+f*110);  b=Math.round(150+f*50)  }
  else if (n < 0.4) { const f=(n-0.2)/0.2;  r=Math.round(30+f*50);   g=Math.round(140+f*60);  b=Math.round(200-f*80)  }
  else if (n < 0.6) { const f=(n-0.4)/0.2;  r=Math.round(80+f*160);  g=Math.round(200+f*20);  b=Math.round(120-f*70)  }
  else if (n < 0.75){ const f=(n-0.6)/0.15; r=240;                    g=Math.round(220-f*90);  b=Math.round(50-f*20)   }
  else               { const f=(n-0.75)/0.25;r=Math.round(240-f*40);  g=Math.round(130-f*110); b=Math.round(30-f*10)   }
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Simple bbox centroid from GeoJSON feature ────────────────────────────────
function centroid(feature) {
  try {
    const flat = feature.geometry.coordinates.flat(Infinity)
    const lngs = [], lats = []
    for (let i = 0; i < flat.length; i += 2) { lngs.push(flat[i]); lats.push(flat[i+1]) }
    const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2
    if (!isFinite(lat) || !isFinite(lng)) return null
    return { lat, lng }
  } catch { return null }
}

// ── Batch Open-Meteo temperature fetch ───────────────────────────────────────
const tempCache = new Map()

async function fetchBatchTemps(points) {
  // points: [{id, lat, lng}]
  const uncached = points.filter(p => !tempCache.has(p.id))
  if (!uncached.length) return

  // Open-Meteo allows multiple lat/lng in one request
  const BATCH = 50
  for (let i = 0; i < uncached.length; i += BATCH) {
    const slice = uncached.slice(i, i + BATCH)
    const lats = slice.map(p => p.lat.toFixed(2)).join(',')
    const lngs = slice.map(p => p.lng.toFixed(2)).join(',')
    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m&wind_speed_unit=kmh`
      )
      if (!r.ok) continue
      const data = await r.json()
      const arr = Array.isArray(data) ? data : [data]
      arr.forEach((d, idx) => {
        const temp = d?.current?.temperature_2m
        if (temp != null) tempCache.set(slice[idx].id, temp)
      })
    } catch { /* silent — globe still spins */ }
  }
}

// ── Legend component ─────────────────────────────────────────────────────────
function TempLegend({ unit }) {
  const steps = [-30,-20,-10,0,10,20,30,40,45]
  const toU = c => unit === 'F' ? Math.round(c * 9/5 + 32) : c
  return (
    <div className="globe-legend" aria-label="Temperature legend">
      <div className="legend-bar" style={{
        background:`linear-gradient(to right,
          ${tempToColor(-30,1)},${tempToColor(-10,1)},${tempToColor(5,1)},
          ${tempToColor(20,1)},${tempToColor(30,1)},${tempToColor(45,1)})`
      }}/>
      <div className="legend-ticks">
        {[-30,-15,0,15,30,45].map(v=>(
          <span key={v}>{toU(v)}°</span>
        ))}
      </div>
    </div>
  )
}

// ── Main Globe component ─────────────────────────────────────────────────────
export default function GlobeView({ onLocationSelect, unit, searchFlyTo }) {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const [status, setStatus] = useState('loading') // 'loading'|'ready'|'error'
  const [hovered, setHovered] = useState(null)    // {name, temp, x, y}
  const [tempMap, setTempMap] = useState({})       // featureId → celsius
  const featuresRef = useRef([])

  // Update polygon colors when tempMap changes
  const updateColors = useCallback((map) => {
    const g = globeRef.current
    if (!g) return
    g.polygonCapColor(d => {
      const t = map[d.id]
      return tempToColor(t != null ? t : null)
    })
  }, [])

  useEffect(() => {
    let mounted = true
    let globe

    ;(async () => {
      try {
        // Dynamic import — keeps initial bundle small
        const [{ default: Globe }, { feature: topoFeature }, topoData] = await Promise.all([
          import('globe.gl'),
          import('topojson-client'),
          import('world-atlas/countries-110m.json'),
        ])
        if (!mounted || !containerRef.current) return

        const geoData = topoFeature(topoData, topoData.objects.countries)
        featuresRef.current = geoData.features

        // Init globe
        globe = Globe({ animateIn: true })(containerRef.current)
        globeRef.current = globe

        // Style
        globe
          .backgroundColor('rgba(0,0,0,0)')
          .showGraticules(true)
          .showAtmosphere(true)
          .atmosphereColor('#1d4ed8')
          .atmosphereAltitude(0.18)
          .globeMaterial(globe.globeMaterial())

        // Dark globe surface
        globe.globeMaterial().color.set('#0d1b3e')
        globe.globeMaterial().emissive.set('#0a1428')

        // Countries
        globe
          .polygonsData(geoData.features)
          .polygonAltitude(0.008)
          .polygonCapColor(d => tempToColor(null))
          .polygonSideColor(() => 'rgba(10,20,50,0.6)')
          .polygonStrokeColor(() => 'rgba(255,255,255,0.07)')
          .polygonLabel(d => `
            <div class="globe-tooltip">
              <strong>${d.properties?.NAME || 'Unknown'}</strong>
            </div>
          `)
          .onPolygonHover((d, prev) => {
            if (!d) { setHovered(null); return }
            const t = tempMap[d.id]
            setHovered({
              name: d.properties?.NAME || '',
              temp: t != null ? t : null,
            })
          })
          .onPolygonClick((d, ev, { lat, lng }) => {
            if (!d) return
            const c = centroid(d) || { lat, lng }
            globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: 1.4 }, 800)
            globe.controls().autoRotate = false
            onLocationSelect(c.lat, c.lng, d.properties?.NAME)
          })

        // Controls
        if (!REDUCED) {
          globe.controls().autoRotate = true
          globe.controls().autoRotateSpeed = 0.35
        }
        globe.controls().enableZoom = true
        globe.controls().minDistance = 150
        globe.controls().maxDistance = 700

        // Pause auto-rotate on user interaction
        globe.controls().addEventListener('start', () => {
          globe.controls().autoRotate = false
        })

        // Resize handler
        function onResize() {
          if (!containerRef.current || !globe) return
          globe.width(containerRef.current.clientWidth)
          globe.height(containerRef.current.clientHeight)
        }
        window.addEventListener('resize', onResize)
        onResize()

        setStatus('ready')

        // Fetch temperatures in background
        const points = geoData.features
          .map(f => {
            const c = centroid(f)
            return c ? { id: f.id, ...c } : null
          })
          .filter(Boolean)

        await fetchBatchTemps(points)
        if (!mounted) return

        const newMap = {}
        points.forEach(p => {
          if (tempCache.has(p.id)) newMap[p.id] = tempCache.get(p.id)
        })
        setTempMap(newMap)
        updateColors(newMap)

        // Pause when tab hidden
        document.addEventListener('visibilitychange', () => {
          if (globe?.controls()) {
            globe.controls().autoRotate = !document.hidden && !REDUCED
          }
        })

        return () => window.removeEventListener('resize', onResize)
      } catch (err) {
        console.error('Globe init failed:', err)
        if (mounted) setStatus('error')
      }
    })()

    return () => {
      mounted = false
      try { globe?.renderer()?.dispose() } catch {}
    }
  }, [])

  // Fly to location when searchFlyTo changes
  useEffect(() => {
    if (!searchFlyTo || !globeRef.current) return
    const { lat, lng } = searchFlyTo
    globeRef.current.pointOfView({ lat, lng, altitude: 1.4 }, 800)
    globeRef.current.controls().autoRotate = false
  }, [searchFlyTo])

  return (
    <div className="globe-wrap" aria-label="Interactive 3D temperature globe">
      {/* Space background */}
      <div className="globe-space" aria-hidden="true"/>

      {/* Globe container */}
      <div ref={containerRef} className="globe-container"/>

      {/* Loading shimmer */}
      {status === 'loading' && (
        <div className="globe-loading" aria-live="polite">
          <div className="globe-shimmer"/>
          <p>Loading globe…</p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="globe-error" role="alert">
          <span>Globe unavailable</span>
        </div>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <div className="globe-tooltip-float">
          <strong>{hovered.name}</strong>
          {hovered.temp != null && (
            <span>
              {unit === 'F'
                ? `${Math.round(hovered.temp * 9/5 + 32)}°F`
                : `${Math.round(hovered.temp)}°C`}
            </span>
          )}
        </div>
      )}

      {/* Temperature legend */}
      {status === 'ready' && <TempLegend unit={unit}/>}
    </div>
  )
}
