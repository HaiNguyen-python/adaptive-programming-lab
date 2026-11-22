/** Sound and celebration effects. Both respect the learner's settings. */

let audio = null;
let soundOn = true;
let motionOn = true;

export function setEffects({ sound, motion }) {
  soundOn = !!sound;
  motionOn = !!motion;
}

export const motionAllowed = () => motionOn && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function tone(freq, start, dur, type = 'sine', gain = 0.08) {
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.currentTime + start);
  g.gain.setValueAtTime(0.0001, audio.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, audio.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + dur);
  osc.connect(g).connect(audio.destination);
  osc.start(audio.currentTime + start);
  osc.stop(audio.currentTime + start + dur + 0.02);
}

const TUNES = {
  right: [[523.25, 0, 0.12, 'triangle'], [783.99, 0.09, 0.2, 'triangle']],
  wrong: [[196, 0, 0.16, 'sine', 0.07], [174.61, 0.1, 0.22, 'sine', 0.07]],
  tap: [[440, 0, 0.05, 'triangle', 0.04]],
  help: [[659.25, 0, 0.1, 'sine', 0.05], [880, 0.08, 0.14, 'sine', 0.05]],
  done: [[523.25, 0, 0.14, 'triangle'], [659.25, 0.12, 0.14, 'triangle'], [783.99, 0.24, 0.14, 'triangle'], [1046.5, 0.36, 0.34, 'triangle']],
};

/** Play a short sound: right, wrong, tap, help or done. */
export function play(name) {
  if (!soundOn) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    for (const t of TUNES[name] || []) tone(...t);
  } catch { /* sound is optional */ }
}

const COLORS = ['#ff8a3d', '#ffc24b', '#5fe3b3', '#6cc5f7', '#f0577a', '#fff3c4'];

/** A burst of sparks over the whole screen, for finishing a lesson. */
export function confetti(duration = 2400) {
  if (!motionAllowed()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  // Round the backing size: fractional pixel ratios (such as 1.25) must not give fractional canvas sizes.
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.scale(canvas.width / W, canvas.height / H);
  const parts = Array.from({ length: 110 }, () => {
    const fromLeft = Math.random() < 0.5;
    return {
      x: fromLeft ? W * 0.12 : W * 0.88,
      y: H * 0.72,
      vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 7),
      vy: -(9 + Math.random() * 10),
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.35,
    };
  });
  const t0 = performance.now();
  function frame(now) {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.globalAlpha = Math.max(0, 1 - t / duration);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame); else canvas.remove();
  }
  requestAnimationFrame(frame);
}

/** A few sparks flying out from an element, for a right answer. */
export function burst(target) {
  if (!motionAllowed() || !target) return;
  const rect = target.getBoundingClientRect();
  const holder = document.createElement('div');
  holder.className = 'burst';
  holder.style.left = `${rect.left + rect.width / 2}px`;
  holder.style.top = `${rect.top + rect.height / 2}px`;
  holder.style.position = 'fixed';
  holder.style.zIndex = '45';
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('i');
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
    const dist = 36 + Math.random() * 34;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    s.style.background = COLORS[i % 3];
    holder.append(s);
  }
  document.body.append(holder);
  setTimeout(() => holder.remove(), 700);
}
