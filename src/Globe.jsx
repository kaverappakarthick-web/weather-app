/**
 * Globe.jsx — Interactive 3D temperature globe
 *
 * Data layers:
 *  - Countries:   world-atlas/countries-50m.json (npm, dynamic import)
 *  - India:       /india-states.json (bundled in public/, Survey of India boundary)
 *  - World admin-1: Natural Earth 110m states/provinces via jsDelivr (lazy-loaded)
 *  - Cities:      Curated inline list
 *
 * NOTE — India border depiction:
 *   This app uses the Survey of India's official boundary for India, which shows
 *   Jammu & Kashmir and Ladakh as integral parts of India. This is a deliberate
 *   localization choice for Indian users. The Natural Earth boundary (which
 *   follows the Line of Control) is intentionally NOT used for India.
 *
 * LOD altitude thresholds (globe-radii above surface):
 *   > ALT_STATE  → country view (no labels)
 *   ≤ ALT_STATE  → state/province labels (lazy-loaded NE 110m admin-1)
 *   ≤ ALT_CITY   → city labels (inline list)
 */
import { useEffect, useRef, useState } from 'react'

const REDUCED   = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const ALT_STATE = 1.8
const ALT_CITY  = 0.9
const INDIA_ID  = 356   // Natural Earth numeric ISO for India

// Served from public/ — bundled with the app, no CDN dependency.
// Generated from geohacker/india with J&K extended to lat ~37°N (Survey of India claim).
// See scripts/prepare-india.js for how this file was produced.
const INDIA_STATES_URL = '/india-states.json'
const WORLD_STATES_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_1_states_provinces.geojson'

// ── Name resolution fallback chain ────────────────────────────────────────────
// Covers: world-atlas (name), Natural Earth country (ADMIN/NAME/SOVEREIGNT),
//         NE admin-1 (NAME_1/name), DataMeet India (ST_NM/st_nm/STATE),
//         district (NAME_2/district)
function resolveName(feature) {
  const p = feature?.properties ?? {}
  const raw =
    p.ADMIN    || p.NAME     || p.NAME_EN  || p.name      || p.SOVEREIGNT ||
    p.NAME_1   || p.name_1   ||
    p.ST_NM    || p.st_nm    || p.State    || p.STATE     ||
    p.NAME_2   || p.district || null
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

// ── Centroid from GeoJSON feature bbox ────────────────────────────────────────
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

// ── Open-Meteo temperature fetch ──────────────────────────────────────────────
const tempCache = new Map()

async function fetchBatchTemps(points) {
  const uncached = points.filter(p => !tempCache.has(p.id))
  if (!uncached.length) return
  const BATCH = 50
  for (let i = 0; i < uncached.length; i += BATCH) {
    const slice = uncached.slice(i, i + BATCH)
    const lats = slice.map(p => p.lat.toFixed(2)).join(',')
    const lngs = slice.map(p => p.lng.toFixed(2)).join(',')
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
  }
}

// ── Curated city labels (no extra fetch) ─────────────────────────────────────
const CITIES = [
  // India
  { lat: 28.64, lng: 77.22, name: 'New Delhi' },
  { lat: 19.08, lng: 72.88, name: 'Mumbai' },
  { lat: 13.08, lng: 80.27, name: 'Chennai' },
  { lat: 22.57, lng: 88.36, name: 'Kolkata' },
  { lat: 12.97, lng: 77.59, name: 'Bengaluru' },
  { lat: 17.39, lng: 78.49, name: 'Hyderabad' },
  { lat: 23.03, lng: 72.58, name: 'Ahmedabad' },
  { lat: 26.91, lng: 75.79, name: 'Jaipur' },
  { lat: 21.15, lng: 79.09, name: 'Nagpur' },
  { lat: 34.09, lng: 74.79, name: 'Srinagar' },
  { lat: 34.17, lng: 77.58, name: 'Leh' },
  // South / SE Asia
  { lat: 27.70, lng: 85.32, name: 'Kathmandu' },
  { lat: 23.72, lng: 90.41, name: 'Dhaka' },
  { lat: 6.93,  lng: 79.85, name: 'Colombo' },
  { lat: 33.68, lng: 73.05, name: 'Islamabad' },
  { lat: 24.86, lng: 67.01, name: 'Karachi' },
  { lat: 16.87, lng: 96.19, name: 'Yangon' },
  { lat: 13.75, lng: 100.52, name: 'Bangkok' },
  { lat: 3.14,  lng: 101.69, name: 'Kuala Lumpur' },
  { lat: 1.35,  lng: 103.82, name: 'Singapore' },
  { lat: 21.03, lng: 105.85, name: 'Hanoi' },
  { lat: 10.82, lng: 106.63, name: 'Ho Chi Minh City' },
  { lat: 14.68, lng: 121.06, name: 'Manila' },
  { lat: -6.21, lng: 106.85, name: 'Jakarta' },
  // East Asia
  { lat: 35.69, lng: 139.69, name: 'Tokyo' },
  { lat: 31.23, lng: 121.47, name: 'Shanghai' },
  { lat: 39.91, lng: 116.39, name: 'Beijing' },
  { lat: 22.28, lng: 114.16, name: 'Hong Kong' },
  { lat: 37.57, lng: 126.98, name: 'Seoul' },
  // Middle East
  { lat: 25.20, lng: 55.27,  name: 'Dubai' },
  { lat: 24.69, lng: 46.72,  name: 'Riyadh' },
  { lat: 33.33, lng: 44.39,  name: 'Baghdad' },
  { lat: 35.69, lng: 51.42,  name: 'Tehran' },
  { lat: 41.01, lng: 28.95,  name: 'Istanbul' },
  // Europe
  { lat: 51.51, lng: -0.13,  name: 'London' },
  { lat: 48.85, lng: 2.35,   name: 'Paris' },
  { lat: 52.52, lng: 13.41,  name: 'Berlin' },
  { lat: 40.42, lng: -3.70,  name: 'Madrid' },
  { lat: 41.90, lng: 12.50,  name: 'Rome' },
  { lat: 55.75, lng: 37.62,  name: 'Moscow' },
  { lat: 48.21, lng: 16.37,  name: 'Vienna' },
  { lat: 52.23, lng: 21.01,  name: 'Warsaw' },
  { lat: 59.33, lng: 18.07,  name: 'Stockholm' },
  { lat: 60.17, lng: 24.94,  name: 'Helsinki' },
  { lat: 59.91, lng: 10.75,  name: 'Oslo' },
  { lat: 55.68, lng: 12.57,  name: 'Copenhagen' },
  { lat: 47.38, lng: 8.54,   name: 'Zurich' },
  { lat: 37.98, lng: 23.73,  name: 'Athens' },
  { lat: 44.43, lng: 26.10,  name: 'Bucharest' },
  { lat: 50.08, lng: 14.44,  name: 'Prague' },
  { lat: 47.50, lng: 19.04,  name: 'Budapest' },
  // Africa
  { lat: 30.06, lng: 31.25,  name: 'Cairo' },
  { lat: 36.74, lng: 3.06,   name: 'Algiers' },
  { lat: 33.99, lng: -6.85,  name: 'Rabat' },
  { lat: -1.29, lng: 36.82,  name: 'Nairobi' },
  { lat: 6.45,  lng: 3.40,   name: 'Lagos' },
  { lat: -33.93, lng: 18.42, name: 'Cape Town' },
  { lat: 9.00,  lng: 38.74,  name: 'Addis Ababa' },
  { lat: 14.69, lng: -17.44, name: 'Dakar' },
  { lat: -4.27, lng: 15.28,  name: 'Kinshasa' },
  { lat: -25.97, lng: 32.59, name: 'Maputo' },
  // Americas
  { lat: 40.71,  lng: -74.01,  name: 'New York' },
  { lat: 34.05,  lng: -118.24, name: 'Los Angeles' },
  { lat: 41.85,  lng: -87.65,  name: 'Chicago' },
  { lat: 29.76,  lng: -95.37,  name: 'Houston' },
  { lat: 43.70,  lng: -79.42,  name: 'Toronto' },
  { lat: 49.25,  lng: -123.12, name: 'Vancouver' },
  { lat: 19.43,  lng: -99.13,  name: 'Mexico City' },
  { lat: 4.71,   lng: -74.07,  name: 'Bogotá' },
  { lat: -12.05, lng: -77.04,  name: 'Lima' },
  { lat: -23.55, lng: -46.63,  name: 'São Paulo' },
  { lat: -22.91, lng: -43.17,  name: 'Rio de Janeiro' },
  { lat: -34.60, lng: -58.38,  name: 'Buenos Aires' },
  { lat: -33.46, lng: -70.65,  name: 'Santiago' },
  { lat: 10.48,  lng: -66.88,  name: 'Caracas' },
  // Oceania
  { lat: -33.87, lng: 151.21,  name: 'Sydney' },
  { lat: -37.81, lng: 144.96,  name: 'Melbourne' },
  { lat: -27.47, lng: 153.03,  name: 'Brisbane' },
  { lat: -31.95, lng: 115.86,  name: 'Perth' },
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
  const tempMapRef   = useRef({})
  const stateRef     = useRef({ loaded: false, features: [] })
  const [status,  setStatus]  = useState('loading')
  const [hovered, setHovered] = useState(null)   // { name, temp }

  useEffect(() => {
    let mounted = true
    let globe

    ;(async () => {
      try {
        // ── 1. Load globe.gl + world-atlas 50m ───────────────────────────────
        const [{ default: Globe }, { feature: topoFeature }, topoData] =
          await Promise.all([
            import('globe.gl'),
            import('topojson-client'),
            import('world-atlas/countries-50m.json'),
          ])
        if (!mounted || !containerRef.current) return

        const geoData = topoFeature(topoData, topoData.objects.countries)

        // ── 2. India states (Survey of India boundary) ────────────────────────
        // NOTE: DataMeet india_states.geojson shows J&K and Ladakh as Indian
        // territory per the official Survey of India maps. This is a deliberate
        // localization choice for Indian users — the Natural Earth LoC-based
        // boundary is not used here.
        let indiaStateFeatures = []
        try {
          const resp = await fetch(INDIA_STATES_URL)
          if (resp.ok) {
            const json = await resp.json()
            indiaStateFeatures = (json.features || []).map((f, i) => ({
              ...f,
              id: `IN_${i}`,
              _indiaFeature: true,
            }))
          } else {
            console.warn('[Globe] india-states.json returned', resp.status)
          }
        } catch (e) {
          console.warn('[Globe] India states fetch failed:', e.message)
        }

        // Remove NE India polygon; replace with DataMeet state polygons
        const baseFeatures = geoData.features.filter(f => f.id !== INDIA_ID)
        const countryFeatures = indiaStateFeatures.length
          ? [...baseFeatures, ...indiaStateFeatures]
          : geoData.features

        // ── 3. Globe init ─────────────────────────────────────────────────────
        globe = Globe({ animateIn: true })(containerRef.current)
        globeRef.current = globe

        globe
          .backgroundColor('rgba(0,0,0,0)')
          .showGraticules(true)
          .showAtmosphere(true)
          .atmosphereColor('#1d4ed8')
          .atmosphereAltitude(0.18)

        globe.globeMaterial().color.set('#0d1b3e')
        globe.globeMaterial().emissive.set('#0a1428')

        // ── 4. Country/state polygons ─────────────────────────────────────────
        globe
          .polygonsData(countryFeatures)
          .polygonAltitude(0.008)
          .polygonCapColor(d => {
            const id = d._indiaFeature ? INDIA_ID : d.id
            return tempToColor(tempMapRef.current[id] ?? null)
          })
          .polygonSideColor(() => 'rgba(10,20,50,0.6)')
          .polygonStrokeColor(() => 'rgba(255,255,255,0.07)')
          .polygonLabel(() => '')  // React overlay handles tooltips

        // ── 5. Labels (configured once; data swapped on LOD change) ──────────
        globe
          .labelsData([])
          .labelLat(d => d.lat ?? 0)
          .labelLng(d => d.lng ?? 0)
          .labelText(d => d.name ?? '')
          .labelSize(0.32)
          .labelDotRadius(0.15)
          .labelColor(() => 'rgba(255,255,255,0.88)')
          .labelAltitude(0.011)
          .labelResolution(3)

        // ── 6. Hover → React tooltip ──────────────────────────────────────────
        globe.onPolygonHover(d => {
          if (!d) { setHovered(null); return }
          const name = resolveName(d)
          if (!name) { setHovered(null); return }
          const id = d._indiaFeature ? INDIA_ID : d.id
          setHovered({ name, temp: tempMapRef.current[id] ?? null })
        })

        // ── 7. Click → fly to + detail ────────────────────────────────────────
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
        globe.controls().enableZoom = true
        globe.controls().minDistance = 150
        globe.controls().maxDistance = 700
        globe.controls().addEventListener('start', () => {
          globe.controls().autoRotate = false
        })

        // ── 9. LOD — switch labels on camera change ───────────────────────────
        let lastLod = 'country'

        function applyLod() {
          const { altitude } = globe.pointOfView()
          const lod = altitude < ALT_CITY  ? 'city'
                    : altitude < ALT_STATE ? 'state'
                    : 'country'
          if (lod === lastLod) return
          lastLod = lod

          if (lod === 'city') {
            globe.labelsData(CITIES)
          } else if (lod === 'state' && stateRef.current.features.length) {
            globe.labelsData(stateRef.current.features)
          } else {
            globe.labelsData([])
          }

          // Lazy-load state data on first zoom past threshold
          if (lod !== 'country' && !stateRef.current.loaded) {
            stateRef.current.loaded = true
            loadStateLabels(stateRef, indiaStateFeatures, () => {
              if (lastLod === 'state') globe.labelsData(stateRef.current.features)
            })
          }
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

        // ── 11. Fetch temperatures ────────────────────────────────────────────
        // Use one representative point for all of India
        const indiaPoint = { id: INDIA_ID, lat: 20.59, lng: 78.96 }
        const countryPoints = geoData.features
          .filter(f => f.id !== INDIA_ID)
          .map(f => { const c = centroid(f); return c ? { id: f.id, ...c } : null })
          .filter(Boolean)

        await fetchBatchTemps([...countryPoints, indiaPoint])
        if (!mounted) return

        const newMap = {}
        ;[...countryPoints, indiaPoint].forEach(p => {
          if (tempCache.has(p.id)) newMap[p.id] = tempCache.get(p.id)
        })
        tempMapRef.current = newMap

        // Refresh polygon colors with live temperature data
        globe.polygonCapColor(d => {
          const id = d._indiaFeature ? INDIA_ID : d.id
          return tempToColor(newMap[id] ?? null)
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

  // External fly-to (search bar)
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

    // Exclude NE admin-1 India entries — DataMeet features replace them
    const nonIndia = (geo.features || []).filter(f => {
      const p = f.properties || {}
      return p.admin !== 'India' && p.adm0_a3 !== 'IND' && p.sov_a3 !== 'IND'
    })

    // Build flat label list: {lat, lng, name} for globe.labelsData
    const toLabel = features => features
      .map(f => {
        const c = centroid(f)
        const name = resolveName(f)
        if (!c || !name) return null
        return { lat: c.lat, lng: c.lng, name }
      })
      .filter(Boolean)

    stateRef.current.features = [
      ...toLabel(nonIndia),
      ...toLabel(indiaStateFeatures),
    ]
    console.log('[Globe] State labels loaded:', stateRef.current.features.length)
    onReady()
  } catch (e) {
    console.warn('[Globe] State labels failed to load:', e.message)
  }
}
