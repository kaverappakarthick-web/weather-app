const fs = require('fs')
const path = require('path')

const css = `

/* ═══════════════════════════════════════════════════════════════════
   AI LAYER — DeepSeek-powered features
   ═══════════════════════════════════════════════════════════════════ */

.ai-badge {
  display: inline-flex; align-items: center;
  background: linear-gradient(135deg,#7c3aed,#4f46e5);
  color: #fff; font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 99px; letter-spacing: .04em; flex-shrink: 0;
}
.ai-disclaimer {
  font-size: 10px; color: rgba(255,255,255,0.35);
  margin: 0; text-align: center; padding-top: 8px;
}
.ai-briefing {
  background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.25);
  backdrop-filter: blur(16px); border-radius: 16px; padding: 16px; margin-bottom: 16px;
}
.ai-briefing--loading { min-height: 80px; }
.ai-briefing-shimmer {
  height: 14px; border-radius: 7px;
  background: linear-gradient(90deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.12) 50%,rgba(255,255,255,0.05) 100%);
  background-size: 200% 100%; animation: shimmer 1.5s infinite; margin-bottom: 10px;
}
.ai-briefing-shimmer--short { width: 60%; }
@keyframes shimmer { to { background-position: -200% 0; } }
.ai-briefing-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ai-briefing-headline { font-size: 15px; font-weight: 600; color: #fff; }
.ai-briefing-summary { font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.55; margin: 0 0 12px; }
.ai-briefing-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.ai-pill {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 99px; padding: 4px 12px; font-size: 12px; color: rgba(255,255,255,0.85);
}
.ai-pill--alert { background: rgba(251,191,36,0.12); border-color: rgba(251,191,36,0.3); color: #fbbf24; }
.ai-pill-icon { font-size: 14px; }
.ai-advisories {
  margin: 0 0 8px; padding: 0; list-style: none;
  font-size: 12px; color: #fca5a5; display: flex; flex-direction: column; gap: 4px;
}
.ai-fab-group {
  position: fixed; bottom: 24px; right: 20px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px; z-index: 200;
}
.ai-fab {
  cursor: pointer; border: none; display: flex; align-items: center;
  justify-content: center; font-weight: 700; transition: transform .15s;
}
.ai-fab:hover { transform: translateY(-2px); }
.ai-fab--chat {
  background: linear-gradient(135deg,#7c3aed,#4f46e5); color: #fff;
  font-size: 13px; gap: 6px; padding: 10px 18px; border-radius: 99px;
  box-shadow: 0 4px 20px rgba(124,58,237,0.5);
}
.ai-fab--plan {
  background: rgba(255,255,255,0.1); backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 18px;
  width: 40px; height: 40px; border-radius: 50%;
}
.chat-overlay {
  position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px); display: flex; align-items: flex-end;
  justify-content: center; animation: fadeIn .2s ease;
}
.chat-drawer {
  width: 100%; max-width: 520px; max-height: 80vh; min-height: 320px;
  background: rgba(10,12,30,0.97); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px 20px 0 0; display: flex; flex-direction: column;
  animation: slideUp .3s cubic-bezier(0.16,1,0.3,1);
}
.chat-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.08);
}
.chat-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #fff; }
.chat-close { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.5); font-size: 16px; padding: 4px; }
.chat-close:hover { color: #fff; }
.chat-messages {
  flex: 1; overflow-y: auto; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth;
}
.chat-empty { text-align: center; color: rgba(255,255,255,0.5); font-size: 13px; padding: 16px 0; }
.chat-empty-icon { font-size: 36px; margin-bottom: 8px; }
.chat-empty p { margin: 0 0 14px; }
.chat-starters { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.chat-starter {
  background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.3);
  color: rgba(255,255,255,0.8); font-size: 11px; padding: 5px 12px;
  border-radius: 99px; cursor: pointer; transition: background .15s;
}
.chat-starter:hover { background: rgba(124,58,237,0.3); }
.chat-msg { display: flex; gap: 8px; align-items: flex-start; }
.chat-msg--user { flex-direction: row-reverse; }
.chat-msg-badge { flex-shrink: 0; font-size: 12px; color: #7c3aed; margin-top: 2px; }
.chat-msg-body {
  max-width: 84%; background: rgba(255,255,255,0.07);
  border-radius: 12px 12px 12px 3px; padding: 9px 12px;
  font-size: 13px; color: rgba(255,255,255,0.9); line-height: 1.55;
}
.chat-msg--user .chat-msg-body {
  background: rgba(124,58,237,0.25); border-radius: 12px 12px 3px 12px; color: #fff;
}
.chat-cursor {
  display: inline-block; width: 2px; height: 14px; background: #7c3aed;
  margin-left: 2px; vertical-align: text-bottom; animation: blink .7s step-end infinite;
}
@keyframes blink { 50% { opacity: 0; } }
.chat-error { font-size: 12px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 8px; padding: 8px 12px; }
.chat-input-row { display: flex; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid rgba(255,255,255,0.07); }
.chat-input {
  flex: 1; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px; padding: 9px 12px; color: #fff; font-size: 13px; outline: none;
}
.chat-input:focus { border-color: rgba(124,58,237,0.5); }
.chat-input::placeholder { color: rgba(255,255,255,0.35); }
.chat-send {
  background: linear-gradient(135deg,#7c3aed,#4f46e5); border: none; border-radius: 10px;
  color: #fff; font-size: 16px; font-weight: 700; width: 38px; cursor: pointer; transition: opacity .15s;
}
.chat-send:disabled { opacity: 0.4; cursor: default; }
.chat-stop {
  width: 100%; background: rgba(248,113,113,0.15); border: 1px solid rgba(248,113,113,0.3);
  color: #f87171; border-radius: 10px; padding: 9px; font-size: 13px; cursor: pointer;
}
.chat-disclaimer { padding: 4px 16px 12px; }
.md-text { display: flex; flex-direction: column; gap: 3px; }
.md-line { display: block; }
.md-bullet { padding-left: 4px; }
.md-code { background: rgba(255,255,255,0.1); border-radius: 4px; padding: 1px 5px; font-family: monospace; font-size: 12px; }
.planner-overlay {
  position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px); display: flex; align-items: center;
  justify-content: center; animation: fadeIn .2s ease; padding: 20px;
}
.planner-panel {
  width: 100%; max-width: 480px; max-height: 90vh;
  background: rgba(10,12,30,0.97); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px; padding: 0 0 4px; display: flex; flex-direction: column;
  animation: slideUp .3s cubic-bezier(0.16,1,0.3,1); overflow: hidden;
}
.planner-header { display: flex; align-items: center; gap: 8px; padding: 14px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.planner-title { flex: 1; font-size: 14px; font-weight: 600; color: #fff; }
.planner-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 16px 8px; }
.planner-chip { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); font-size: 11px; padding: 4px 11px; border-radius: 99px; cursor: pointer; }
.planner-chip--active { background: rgba(124,58,237,0.3); border-color: rgba(124,58,237,0.5); color: #fff; }
.planner-custom-row { display: flex; gap: 8px; padding: 4px 16px 12px; }
.planner-go { width: 38px; flex-shrink: 0; }
.planner-loading { display: flex; align-items: center; gap: 10px; padding: 20px 16px; color: rgba(255,255,255,0.6); font-size: 13px; }
.planner-spinner { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(124,58,237,0.3); border-top-color: #7c3aed; animation: spin .7s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.planner-results { flex: 1; overflow-y: auto; padding: 8px 16px 4px; display: flex; flex-direction: column; gap: 8px; }
.planner-day { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 10px 12px; }
.planner-day--best { background: rgba(124,58,237,0.15); border-color: rgba(124,58,237,0.3); }
.planner-rank { font-size: 18px; font-weight: 800; min-width: 28px; text-align: center; }
.planner-day-icon { flex-shrink: 0; }
.planner-day-info { flex: 1; min-width: 0; }
.planner-day-name { font-size: 13px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 6px; }
.planner-best-badge { background: linear-gradient(135deg,#7c3aed,#4f46e5); color: #fff; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 99px; }
.planner-day-reason { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; }
.planner-day-meta   { font-size: 11px; color: rgba(255,255,255,0.45); margin-top: 2px; }
.planner-score-bar { width: 4px; height: 40px; background: rgba(255,255,255,0.08); border-radius: 2px; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
.planner-score-bar > div { width: 100%; border-radius: 2px; }
`

const target = path.join(__dirname, '../src/index.css')
fs.appendFileSync(target, css)
console.log('Done. Appended', css.length, 'chars to index.css')
