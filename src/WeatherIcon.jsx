/**
 * Animated SVG weather icons — procedural, no images.
 * Each icon is self-contained, 64×64 viewBox.
 */

export default function WeatherIcon({ code, isNight, size = 64, className = '' }) {
  const s = size

  // ── Clear / Sunny ────────────────────────────────────────────────────────
  if (code === 800 && !isNight) return (
    <svg width={s} height={s} viewBox="0 0 64 64" className={className} aria-label="Clear sky">
      <style>{`
        @keyframes spin-slow { from{transform-origin:32px 32px;transform:rotate(0deg)}to{transform-origin:32px 32px;transform:rotate(360deg)} }
        @keyframes pulse-sun { 0%,100%{opacity:.7}50%{opacity:1} }
        @media(prefers-reduced-motion:reduce){.sun-rays,.sun-core{animation:none}}
      `}</style>
      <g className="sun-rays" style={{animation:'spin-slow 12s linear infinite'}}>
        {[0,45,90,135,180,225,270,315].map(a=>(
          <line key={a} x1="32" y1="6" x2="32" y2="12"
            stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"
            transform={`rotate(${a} 32 32)`}/>
        ))}
      </g>
      <circle className="sun-core" cx="32" cy="32" r="12"
        fill="#fbbf24" style={{animation:'pulse-sun 3s ease-in-out infinite'}}/>
    </svg>
  )

  // ── Clear / Night ────────────────────────────────────────────────────────
  if (code === 800 && isNight) return (
    <svg width={s} height={s} viewBox="0 0 64 64" className={className} aria-label="Clear night">
      <style>{`
        @keyframes moon-glow{0%,100%{filter:drop-shadow(0 0 4px #a78bfa)}50%{filter:drop-shadow(0 0 10px #a78bfa)}}
        @media(prefers-reduced-motion:reduce){.moon{animation:none}}
      `}</style>
      <path className="moon" d="M38 14 A18 18 0 1 0 38 50 A14 14 0 1 1 38 14Z"
        fill="#c4b5fd" style={{animation:'moon-glow 4s ease-in-out infinite'}}/>
      {[[10,10],[50,18],[8,44],[52,46],[22,6]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r="1.2" fill="white" opacity={0.7+i*0.06}/>
      ))}
    </svg>
  )

  // ── Partly Cloudy ────────────────────────────────────────────────────────
  if (code === 801 || code === 802) return (
    <svg width={s} height={s} viewBox="0 0 64 64" className={className} aria-label="Partly cloudy">
      <style>{`
        @keyframes cloud-drift{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}
        @media(prefers-reduced-motion:reduce){.cloud-shape{animation:none}}
      `}</style>
      <circle cx="28" cy="26" r="9" fill="#fbbf24" opacity="0.9"/>
      <g className="cloud-shape" style={{animation:'cloud-drift 4s ease-in-out infinite'}}>
        <circle cx="26" cy="38" r="10" fill="white" opacity="0.95"/>
        <circle cx="38" cy="36" r="12" fill="white" opacity="0.95"/>
        <circle cx="48" cy="40" r="8" fill="white" opacity="0.95"/>
        <rect x="16" y="38" width="40" height="12" rx="2" fill="white" opacity="0.95"/>
      </g>
    </svg>
  )

  // ── Cloudy ───────────────────────────────────────────────────────────────
  if (code >= 803) return (
    <svg width={s} height={s} viewBox="0 0 64 64" className={className} aria-label="Cloudy">
      <style>{`
        @keyframes cloud1{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
        @keyframes cloud2{0%,100%{transform:translateX(0)}50%{transform:translateX(-3px)}}
        @media(prefers-reduced-motion:reduce){.cl1,.cl2{animation:none}}
      `}</style>
      <g className="cl2" opacity="0.6" style={{animation:'cloud2 5s ease-in-out infinite'}}>
        <circle cx="22" cy="28" r="10" fill="#d1d5db"/>
        <circle cx="36" cy="25" r="12" fill="#d1d5db"/>
        <circle cx="46" cy="30" r="8" fill="#d1d5db"/>
        <rect x="12" y="28" width="42" height="10" rx="2" fill="#d1d5db"/>
      </g>
      <g className="cl1" style={{animation:'cloud1 4s ease-in-out infinite'}}>
        <circle cx="24" cy="38" r="10" fill="#e5e7eb"/>
        <circle cx="38" cy="35" r="13" fill="#e5e7eb"/>
        <circle cx="50" cy="40" r="9" fill="#e5e7eb"/>
        <rect x="14" y="38" width="45" height="12" rx="2" fill="#e5e7eb"/>
      </g>
    </svg>
  )

  // ── Rain ─────────────────────────────────────────────────────────────────
  if (code >= 300 && code < 600) return (
    <svg width={s} height={s} viewBox="0 0 64 64" className={className} aria-label="Rain">
      <style>{`
        @keyframes drop1{0%{transform:translateY(0);opacity:1}100%{transform:translateY(16px);opacity:0}}
        @keyframes drop2{0%{transform:translateY(0);opacity:1}100%{transform:translateY(16px);opacity:0}}
        @keyframes drop3{0%{transform:translateY(0);opacity:1}100%{transform:translateY(16px);opacity:0}}
        @media(prefers-reduced-motion:reduce){.d1,.d2,.d3{animation:none}}
      `}</style>
      <circle cx="24" cy="22" r="10" fill="#93c5fd" opacity="0.9"/>
      <circle cx="38" cy="19" r="12" fill="#93c5fd" opacity="0.9"/>
      <circle cx="48" cy="24" r="8" fill="#93c5fd" opacity="0.9"/>
      <rect x="14" y="22" width="42" height="10" rx="2" fill="#93c5fd" opacity="0.9"/>
      <line className="d1" x1="24" y1="38" x2="20" y2="50" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"
        style={{animation:'drop1 1.2s linear infinite'}}/>
      <line className="d2" x1="34" y1="36" x2="30" y2="50" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"
        style={{animation:'drop2 1.2s linear infinite 0.4s'}}/>
      <line className="d3" x1="44" y1="38" x2="40" y2="50" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"
        style={{animation:'drop3 1.2s linear infinite 0.8s'}}/>
    </svg>
  )

  // ── Storm ────────────────────────────────────────────────────────────────
  if (code >= 200 && code < 300) return (
    <svg width={s} height={s} viewBox="0 0 64 64" className={className} aria-label="Thunderstorm">
      <style>{`
        @keyframes bolt{0%,90%,100%{opacity:0}92%,98%{opacity:1}}
        @media(prefers-reduced-motion:reduce){.bolt{animation:none}}
      `}</style>
      <circle cx="22" cy="20" r="10" fill="#4b5563"/>
      <circle cx="36" cy="17" r="12" fill="#4b5563"/>
      <circle cx="47" cy="22" r="9" fill="#4b5563"/>
      <rect x="12" y="20" width="44" height="12" rx="2" fill="#4b5563"/>
      <path className="bolt" d="M34 30 L28 43 L33 43 L30 54 L40 39 L35 39 L38 30Z"
        fill="#fde047" style={{animation:'bolt 2.5s ease-in-out infinite'}}/>
    </svg>
  )

  // ── Snow ─────────────────────────────────────────────────────────────────
  if (code >= 600 && code < 700) return (
    <svg width={s} height={s} viewBox="0 0 64 64" className={className} aria-label="Snow">
      <style>{`
        @keyframes flake1{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(4px) rotate(180deg)}}
        @keyframes flake2{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(3px) rotate(-180deg)}}
        @media(prefers-reduced-motion:reduce){.f1,.f2,.f3{animation:none}}
      `}</style>
      <circle cx="24" cy="20" r="10" fill="#bfdbfe"/>
      <circle cx="38" cy="17" r="12" fill="#bfdbfe"/>
      <circle cx="48" cy="22" r="8" fill="#bfdbfe"/>
      <rect x="14" y="20" width="40" height="10" rx="2" fill="#bfdbfe"/>
      {/* snowflakes */}
      {[[22,46],[34,42],[46,46]].map(([x,y],i)=>(
        <g key={i} className={`f${i+1}`}
          style={{transformOrigin:`${x}px ${y}px`, animation:`flake${i%2+1} ${1.5+i*0.3}s ease-in-out infinite ${i*0.4}s`}}>
          <line x1={x} y1={y-5} x2={x} y2={y+5} stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <line x1={x-5} y1={y} x2={x+5} y2={y} stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <line x1={x-3} y1={y-3} x2={x+3} y2={y+3} stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1={x+3} y1={y-3} x2={x-3} y2={y+3} stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </g>
      ))}
    </svg>
  )

  // ── Fog / Mist ───────────────────────────────────────────────────────────
  if (code >= 700 && code < 800) return (
    <svg width={s} height={s} viewBox="0 0 64 64" className={className} aria-label="Fog">
      <style>{`
        @keyframes fog-shift{0%,100%{transform:translateX(0)}50%{transform:translateX(6px)}}
        @media(prefers-reduced-motion:reduce){.fog-line{animation:none}}
      `}</style>
      {[22,32,42,52].map((y,i)=>(
        <rect key={y} className="fog-line" x="10" y={y} width={44-i*4} height="4" rx="2"
          fill="#9ca3af" opacity={0.6-i*0.08}
          style={{animation:`fog-shift ${3+i*0.5}s ease-in-out infinite ${i*0.3}s`}}/>
      ))}
    </svg>
  )

  // fallback
  return <span style={{fontSize: size * 0.7}}>{isNight ? '🌙' : '🌤️'}</span>
}
