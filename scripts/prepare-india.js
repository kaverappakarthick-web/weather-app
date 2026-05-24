/**
 * scripts/prepare-india.js
 *
 * Generates public/india-states.json — a lightweight India states GeoJSON
 * with the J&K polygon extended to show the full Survey of India boundary
 * (J&K + Ladakh reaching lat ~37°N, covering the Siachen/Gilgit region).
 *
 * Source: geohacker/india (github.com/geohacker/india) — MIT licence
 *
 * Usage (run once, commit the output):
 *   node scripts/prepare-india.js
 *
 * Requires the geohacker state file to be downloaded first:
 *   curl -o /tmp/india_gh.json \
 *     https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson
 */

const fs   = require('fs')
const path = require('path')

const INPUT  = process.argv[2] || '/tmp/india_gh.json'
const OUTPUT = path.join(__dirname, '../public/india-states.json')

// ── Douglas-Peucker simplification ─────────────────────────────────────────
function perpDist(p, a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1]
  const len2 = dx*dx + dy*dy
  if (!len2) return Math.hypot(p[0]-a[0], p[1]-a[1])
  const t = ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / len2
  return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy))
}

function rdp(pts, eps) {
  if (pts.length <= 2) return pts
  let maxD = 0, idx = 0
  for (let i = 1; i < pts.length-1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length-1])
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD > eps) {
    const l = rdp(pts.slice(0, idx+1), eps)
    const r = rdp(pts.slice(idx), eps)
    return [...l.slice(0,-1), ...r]
  }
  return [pts[0], pts[pts.length-1]]
}

function simplifyRing(ring, eps) {
  const s = rdp(ring, eps)
  if (s.length < 4) return ring.slice(0, 3).concat([ring[0]])
  if (s[0][0] !== s[s.length-1][0] || s[0][1] !== s[s.length-1][1]) s.push(s[0])
  return s
}

function simplifyGeom(geom, eps) {
  if (geom.type === 'Polygon')
    return { ...geom, coordinates: geom.coordinates.map(r => simplifyRing(r, eps)) }
  if (geom.type === 'MultiPolygon')
    return { ...geom, coordinates: geom.coordinates.map(p => p.map(r => simplifyRing(r, eps))) }
  return geom
}

// ── Extend J&K northward (Survey of India claim) ────────────────────────────
// The source data caps at lat ~35.5°N (actual Line of Control).
// The Survey of India shows J&K extending to ~37°N, including the Siachen
// glacier and the full area claimed but administered by Pakistan/China.
// We linearly scale all points above lat 33°N toward lat 37°N.
function extendJKNorthward(geom) {
  function scale(coords) {
    return coords.map(([lng, lat]) => {
      if (lat > 33.0) {
        const scaled = 33 + (lat - 33) * (4.0 / 2.5)  // 35.5 → 37.0
        return [lng, Math.min(scaled, 37.1)]
      }
      return [lng, lat]
    })
  }
  if (geom.type === 'Polygon')
    return { ...geom, coordinates: geom.coordinates.map(scale) }
  if (geom.type === 'MultiPolygon')
    return { ...geom, coordinates: geom.coordinates.map(p => p.map(scale)) }
  return geom
}

// ── Main ────────────────────────────────────────────────────────────────────
const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'))

const features = data.features.map(f => {
  const EPS  = 0.05   // ~5 km tolerance
  let geom   = simplifyGeom(f.geometry, EPS)
  const name = f.properties.NAME_1

  // NOTE: This is a deliberate localization — J&K is shown in full as Indian
  // territory per the Survey of India, not per the Line of Control.
  if (name === 'Jammu and Kashmir') geom = extendJKNorthward(geom)

  return {
    type: 'Feature',
    id:   f.properties.ID_1,
    properties: {
      name: name,
      type: f.properties.TYPE_1 || f.properties.ENGTYPE_1,
    },
    geometry: geom,
  }
})

const out = JSON.stringify({ type: 'FeatureCollection', features })
fs.writeFileSync(OUTPUT, out)
console.log('Written:', OUTPUT)
console.log('Size:', Math.round(out.length / 1024), 'KB,', features.length, 'states')
