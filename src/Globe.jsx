/**
 * Globe.jsx — Interactive 3D temperature globe
 *
 * Data layers:
 *  - Countries:   world-atlas/countries-110m.json (177 features, 10k coords — fast)
 *  - India:       /india-states.json (bundled in public/, Survey of India boundary)
 *  - World admin-1: Natural Earth 110m states/provinces via jsDelivr (lazy on zoom)
 *  - Cities:      Curated inline list
 *
 * NOTE — India border depiction:
 *   This app uses the Survey of India's official boundary for India, which shows
 *   Jammu & Kashmir and Ladakh as integral parts of India. This is a deliberate
 *   localization choice for Indian users. The Natural Earth boundary (which
 *   follows the Line of Control) is intentionally NOT used for India.
 *
 * Performance decisions:
 *   - 110m (not 50m) countries: 9.4× fewer coordinates → 9× smaller chunk,
 *     dramatically less GPU polygon work per frame.
 *   - pixelRatio capped at 1.5: halves fragment shader work on retina/mobile.
 *   - polygonCapColor uses a pre-built id→color Map (O(1) lookup, no recompute).
 *   - graticules off: removes ~200 extra line draws per frame.
 *   - Temperature batches apply colors progressively, not after all fetches done.
 *   - LOD changes debounced 150 ms to avoid thrash during scroll.
 *   - labelResolution 2 (was 3): 4× fewer label geometry vertices.
 *
 * LOD thresholds (globe-radii):
 *   > ALT_STATE  → no labels
 *   ≤ ALT_STATE  → state labels (lazy NE 110m admin-1)
 *   ≤ ALT_CITY   → city labels (inline)
 */
import { useEffect, useRef, useState } from 'react'

const REDUCED   = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const ALT_STATE = 1.8
const ALT_CITY  = 0.9
const INDIA_ID  = 356

const INDIA_STATES_URL = '/india-states.json'
const WORLD_STATES_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_1_states_provinces.geojson'

// ── Name resolution fallback chain ────────────────────────────────────────────
function resolveName(feature) {
  const p = feature?.properties ?? {}
  const raw =
    p.ADMIN  || p.NAME   || p.NAME_EN || p.name   || p.SOVEREIGNT ||
    p.NAME_1 || p.name_1 ||
    p.ST_NM  || p.st_nm  || p.State   || p.STATE  ||
    p.NAME_2 || p.district || null
  if (!raw || !String(raw).trim()) {
    if (feature?.id !== undefined)
      console.warn('[Globe] unnamed feature id=%s', feature.id)
    return null
  }
  return String(raw).trim()
}

// ── Temperature → RGBA ────────────────────────────────────────────────────────
export function tempToColor(c, alpha = 0.82) {
  if (c == null) return `rgba(40,55,80,${alpha})`
  const t = Math.max(-30, Math.min(45, c))
  const n = (t + 30) / 75
  let r, g, b
  if      (n < 0.2)  { const f=n/0.2;        r=Math.round(10+f*20);   g=Math.round(30+f*110);  b=Math.round(150+f*50)  }
  else if (n < 0.4)  { const f=(n-0.2)/0.2;  r=Math.round(30+f*50);   g=Math.round(140+f*60);  b=Math.round(200-f*80)  }
  else if (n < 0.6)  { const f=(n-0.4)/0.2;  r=Math.round(80+f*160);  g=Math.round(200+f*20);  b=Math.round(120-f*70)  }
  else if (n < 0.75) { const f=(n-0.6)/0.15; r=240;                    g=Math.round(220-f*90);  b=Math.round(50-f*20)   }
  else               { const f=(n-0.75)/0.25; r=Math.round(240-f*40);  g=Math.round(130-f*110); b=Math.round(30-f*10)   }
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Centroid ──────────────────────────────────────────────────────────────────
function centroid(feature) {
  try {
    const flat = feature.geometry.coordinates.flat(Infinity)
    const lngs = [], lats = []
    for (let i = 0; i < flat.length; i += 2) { lngs.push(flat[i]); lats.push(flat[i+1]) }
    const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2
    return isFinite(lat) && isFinite(lng) ? { lat, lng } : null
  } catch { return null }
}

// ── Temperature fetch (progressive — applies colors after each batch) ─────────
const tempCache = new Map()

async function fetchTempsProgressive(points, onBatchDone) {
  const uncached = points.filter(p => !tempCache.has(p.id))
  if (!uncached.length) { onBatchDone(); return }

  const BATCH = 50
  for (let i = 0; i < uncached.length; i += BATCH) {
    const slice = uncached.slice(i, i + BATCH)
    const lats  = slice.map(p => p.lat.toFixed(2)).join(',')
    const lngs  = slice.map(p => p.lng.toFixed(2)).join(',')
    try {
      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m`
      )
      if (!resp.ok) continue
      const data = await resp.json()
      ;(Array.isArray(data) ? data : [data]).forEach((d, idx) => {
        const temp = d?.current?.temperature_2m
        if (temp != null) tempCache.set(slice[idx].id, temp)
      })
    } catch {}
    onBatchDone()   // repaint after every batch, not just at the end
  }
}

// ── City labels ───────────────────────────────────────────────────────────────
const CITIES = [
  { lat: 28.64, lng: 77.22, name: 'New Delhi' },
  { lat: 19.08, lng: 72.88, name: 'Mumbai' },
  { lat: 13.08, lng: 80.27, name: 'Chennai' },
  { lat: 22.57, lng: 88.36, name: 'Kolkata' },
  { lat: 12.97, lng: 77.59, name: 'Bengaluru' },
  { lat: 17.39, lng: 78.49, name: 'Hyderabad' },
  { lat: 23.03, lng: 72.58, name: 'Ahmedabad' },
  { lat: 26.91, lng: 75.79, name: 'Jaipur' },
  { lat: 34.09, lng: 74.79, name: 'Srinagar' },
  { lat: 34.17, lng: 77.58, name: 'Leh' },
  { lat: 27.70, lng: 85.32, name: 'Kathmandu' },
  { lat: 23.72, lng: 90.41, name: 'Dhaka' },
  { lat: 6.93,  lng: 79.85, name: 'Colombo' },
  { lat: 33.68, lng: 73.05, name: 'Islamabad' },
  { lat: 24.86, lng: 67.01, name: 'Karachi' },
  { lat: 13.75, lng: 100.52, name: 'Bangkok' },
  { lat: 3.14,  lng: 101.69, name: 'Kuala Lumpur' },
  { lat: 1.35,  lng: 103.82, name: 'Singapore' },
  { lat: 10.82, lng: 106.63, name: 'Ho Chi Minh City' },
  { lat: 14.68, lng: 121.06, name: 'Manila' },
  { lat: -6.21, lng: 106.85, name: 'Jakarta' },
  { lat: 35.69, lng: 139.69, name: 'Tokyo' },
  { lat: 31.23, lng: 121.47, name: 'Shanghai' },
  { lat: 39.91, lng: 116.39, name: 'Beijing' },
  { lat: 22.28, lng: 114.16, name: 'Hong Kong' },
  { lat: 37.57, lng: 126.98, name: 'Seoul' },
  { lat: 25.20, lng: 55.27,  name: 'Dubai' },
  { lat: 24.69, lng: 46.72,  name: 'Riyadh' },
  { lat: 33.33, lng: 44.39,  name: 'Baghdad' },
  { lat: 35.69, lng: 51.42,  name: 'Tehran' },
  { lat: 41.01, lng: 28.95,  name: 'Istanbul' },
  { lat: 51.51, lng: -0.13,  name: 'London' },
  { lat: 48.85, lng: 2.35,   name: 'Paris' },
  { lat: 52.52, lng: 13.41,  name: 'Berlin' },
  { lat: 40.42, lng: -3.70,  name: 'Madrid' },
  { lat: 41.90, lng: 12.50,  name: 'Rome' },
  { lat: 55.75, lng: 37.62,  name: 'Moscow' },
  { lat: 48.21, lng: 16.37,  name: 'Vienna' },
  { lat: 59.33, lng: 18.07,  name: 'Stockholm' },
  { lat: 60.17, lng: 24.94,  name: 'Helsinki' },
  { lat: 30.06, lng: 31.25,  name: 'Cairo' },
  { lat: -1.29, lng: 36.82,  name: 'Nairobi' },
  { lat: 6.45,  lng: 3.40,   name: 'Lagos' },
  { lat: -33.93, lng: 18.42, name: 'Cape Town' },
  { lat: 9.00,  lng: 38.74,  name: 'Addis Ababa' },
  { lat: 40.71,  lng: -74.01,  name: 'New York' },
  { lat: 34.05,  lng: -118.24, name: 'Los Angeles' },
  { lat: 41.85,  lng: -87.65,  name: 'Chicago' },
  { lat: 43.70,  lng: -79.42,  name: 'Toronto' },
  { lat: 19.43,  lng: -99.13,  name: 'Mexico City' },
  { lat: -23.55, lng: -46.63,  name: 'São Paulo' },
  { lat: -34.60, lng: -58.38,  name: 'Buenos Aires' },
  { lat: -33.46, lng: -70.65,  name: 'Santiago' },
  { lat: -33.87, lng: 151.21,  name: 'Sydney' },
  { lat: -37.81, lng: 144.96,  name: 'Melbourne' },
  { lat: -36.86, lng: 174.77,  name: 'Auckland' },
]

// ── Temperature legend ────────────────────────────────────────────────────────
function TempLegend({ unit }) {
  const toU = c => unit === 'F' ? Math.round(c * 9/5 + 32) : c
  return (
    <div className="globe-legend" aria-label="Temperature legend">
      <div className="legend-bar" style={{
        background: `linear-gradient(to right,
          ${tempToColor(-30,1)},${tempToColor(-10,1)},${tempToColor(5,1)},
          ${tempToColor(20,1)},${tempToColor(30,1)},${tempToColor(45,1)})`
      }}/>
      <div className="legend-ticks">
        {[-30,-15,0,15,30,45].map(v => (
          <span key={v}>{toU(v)}°</span>
        ))}
      </div>
    </div>
  )
}

// ── Main Globe component ──────────────────────────────────────────────────────
export default function GlobeView({ onLocationSelect, unit, searchFlyTo }) {
  const containerRef = useRef(null)
  const globeRef     = useRef(null)
  const tempMapRef   = useRef({})          // id → celsius
  const colorMapRef  = useRef(new Map())   // id → rgba string (pre-built)
  const stateRef     = useRef({ loaded: false, features: [] })
  const [status,  setStatus]  = useState('loading')
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    let mounted = true
    let globe

    ;(async () => {
      try {
        // ── 1. Load globe.gl + countries-110m (9× smaller than 50m) ──────────
        const [{ default: Globe }, { feature: topoFeature }, topoData] =
          await Promise.all([
            import('globe.gl'),
            import('topojson-client'),
            import('world-atlas/countries-110m.json'),
          ])
        if (!mounted || !containerRef.current) return

        const geoData = topoFeature(topoData, topoData.objects.countries)

        // ── 2. India states (Survey of India boundary, bundled locally) ───────
        // NOTE: /india-states.json shows J&K northward to lat ~37°N per the
        // Survey of India's official depiction. Deliberate localization for
        // Indian users — Natural Earth LoC boundary intentionally not used.
        let indiaStateFeatures = []
        try {
          const resp = await fetch(INDIA_STATES_URL)
          if (resp.ok) {
            const json = await resp.json()
            indiaStateFeatures = (json.features || []).map((f, i) => ({
              ...f, id: `IN_${i}`, _indiaFeature: true,
            }))
          } else {
            console.warn('[Globe] india-states.json:', resp.status)
          }
        } catch (e) {
          console.warn('[Globe] India states fetch failed:', e.message)
        }

        const baseFeatures = geoData.features.filter(f => f.id !== INDIA_ID)
        const countryFeatures = indiaStateFeatures.length
          ? [...baseFeatures, ...indiaStateFeatures]
          : geoData.features

        // ── 3. Globe init ─────────────────────────────────────────────────────
        globe = Globe({ animateIn: true })(containerRef.current)
        globeRef.current = globe

        // Cap pixel ratio: halves GPU work on retina/mobile screens
        globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

        globe
          .backgroundColor('rgba(0,0,0,0)')
          .showGraticules(false)      // graticules = ~200 extra line draws/frame
          .showAtmosphere(true)
          .atmosphereColor('#1d4ed8')
          .atmosphereAltitude(0.15)

        globe.globeMaterial().color.set('#0d1b3e')
        globe.globeMaterial().emissive.set('#0a1428')

        // ── 4. Polygons — color from pre-built Map (O(1) per polygon) ─────────
        // colorMapRef is updated whenever temperature data arrives; polygonCapColor
        // does a single Map.get() instead of calling tempToColor() every frame.
        function rebuildColorMap() {
          const m = new Map()
          countryFeatures.forEach(d => {
            const id = d._indiaFeature ? INDIA_ID : d.id
            m.set(d.id, tempToColor(tempMapRef.current[id] ?? null))
          })
          colorMapRef.current = m
          globe.polygonCapColor(d => colorMapRef.current.get(d.id) ?? tempToColor(null))
        }
        rebuildColorMap()   // initial (all grey)

        globe
          .polygonsData(countryFeatures)
          .polygonAltitude(0.006)
          .polygonSideColor(() => 'rgba(10,20,50,0.5)')
          .polygonStrokeColor(() => 'rgba(255,255,255,0.06)')
          .polygonLabel(() => '')

        // ── 5. Labels ─────────────────────────────────────────────────────────
        globe
          .labelsData([])
          .labelLat(d => d.lat ?? 0)
          .labelLng(d => d.lng ?? 0)
          .labelText(d => d.name ?? '')
          .labelSize(0.32)
          .labelDotRadius(0.15)
          .labelColor(() => 'rgba(255,255,255,0.88)')
          .labelAltitude(0.011)
          .labelResolution(2)   // was 3 — 4× fewer label geometry vertices

        // ── 6. Hover ──────────────────────────────────────────────────────────
        globe.onPolygonHover(d => {
          if (!d) { setHovered(null); return }
          const name = resolveName(d)
          if (!name) { setHovered(null); return }
          const id = d._indiaFeature ? INDIA_ID : d.id
          setHovered({ name, temp: tempMapRef.current[id] ?? null })
        })

        // ── 7. Click ──────────────────────────────────────────────────────────
        globe.onPolygonClick((d, ev, { lat, lng }) => {
          if (!d) return
          const c = centroid(d) || { lat, lng }
          globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: 1.4 }, 800)
          globe.controls().autoRotate = false
          onLocationSelect(c.lat, c.lng, resolveName(d))
        })

        // ── 8. Controls ───────────────────────────────────────────────────────
        if (!REDUCED) {
          globe.controls().autoRotate = true
          globe.controls().autoRotateSpeed = 0.35
        }
        globe.controls().enableZoom  = true
        globe.controls().minDistance = 150
        globe.controls().maxDistance = 700
        globe.controls().addEventListener('start', () => {
          globe.controls().autoRotate = false
        })

        // ── 9. LOD labels — debounced to avoid thrash during scroll ───────────
        let lastLod = 'country'
        let lodTimer = null

        function applyLod() {
          clearTimeout(lodTimer)
          lodTimer = setTimeout(() => {
            const { altitude } = globe.pointOfView()
            const lod = altitude < ALT_CITY  ? 'city'
                      : altitude < ALT_STATE ? 'state'
                      : 'country'
            if (lod === lastLod) return
            lastLod = lod

            if      (lod === 'city')  globe.labelsData(CITIES)
            else if (lod === 'state' && stateRef.current.features.length)
                                      globe.labelsData(stateRef.current.features)
            else                      globe.labelsData([])

            if (lod !== 'country' && !stateRef.current.loaded) {
              stateRef.current.loaded = true
              loadStateLabels(stateRef, indiaStateFeatures, () => {
                if (lastLod === 'state') globe.labelsData(stateRef.current.features)
              })
            }
          }, 150)
        }

        globe.controls().addEventListener('change', applyLod)

        // ── 10. Resize ────────────────────────────────────────────────────────
        function onResize() {
          if (!containerRef.current || !globe) return
          globe.width(containerRef.current.clientWidth)
          globe.height(containerRef.current.clientHeight)
        }
        window.addEventListener('resize', onResize)
        onResize()

        setStatus('ready')

        // ── 11. Temperature fetch (progressive) ───────────────────────────────
        // Colors repaint after each batch of 50 countries, not after all done.
        const indiaPoint    = { id: INDIA_ID, lat: 20.59, lng: 78.96 }
        const countryPoints = geoData.features
          .filter(f => f.id !== INDIA_ID)
          .map(f => { const c = centroid(f); return c ? { id: f.id, ...c } : null })
          .filter(Boolean)

        await fetchTempsProgressive([...countryPoints, indiaPoint], () => {
          if (!mounted) return
          // Sync tempMapRef from cache
          const m = {}
          ;[...countryPoints, indiaPoint].forEach(p => {
            if (tempCache.has(p.id)) m[p.id] = tempCache.get(p.id)
          })
          tempMapRef.current = m
          rebuildColorMap()
        })

        // Tab visibility pause
        document.addEventListener('visibilitychange', () => {
          if (globe?.controls())
            globe.controls().autoRotate = !document.hidden && !REDUCED
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

  useEffect(() => {
    if (!searchFlyTo || !globeRef.current) return
    const { lat, lng } = searchFlyTo
    globeRef.current.pointOfView({ lat, lng, altitude: 1.4 }, 800)
    globeRef.current.controls().autoRotate = false
  }, [searchFlyTo])

  return (
    <div className="globe-wrap" aria-label="Interactive 3D temperature globe">
      <div className="globe-space" aria-hidden="true"/>
      <div ref={containerRef} className="globe-container"/>

      {status === 'loading' && (
        <div className="globe-loading" aria-live="polite">
          <div className="globe-shimmer"/>
          <p>Loading globe…</p>
        </div>
      )}
      {status === 'error' && (
        <div className="globe-error" role="alert"><span>Globe unavailable</span></div>
      )}

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

      {status === 'ready' && <TempLegend unit={unit}/>}
    </div>
  )
}

// ── Lazy state label loader ───────────────────────────────────────────────────
async function loadStateLabels(stateRef, indiaStateFeatures, onReady) {
  try {
    const resp = await fetch(WORLD_STATES_URL)
    if (!resp.ok) return
    const geo = await resp.json()

    const nonIndia = (geo.features || []).filter(f => {
      const p = f.properties || {}
      return p.admin !== 'India' && p.adm0_a3 !== 'IND' && p.sov_a3 !== 'IND'
    })

    const toLabel = features => features
      .map(f => {
        const c = centroid(f)
        const name = resolveName(f)
        return (c && name) ? { lat: c.lat, lng: c.lng, name } : null
      })
      .filter(Boolean)

    stateRef.current.features = [...toLabel(nonIndia), ...toLabel(indiaStateFeatures)]
    onReady()
  } catch (e) {
    console.warn('[Globe] State labels failed:', e.message)
  }
}
