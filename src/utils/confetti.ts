// AUTO-GENERATED usage: import { fireConfetti } from './utils/confetti' (content.ts)
// Dashboard: loaded as IIFE via public/utils/confetti.js, accessed via window.sbConfetti.fireConfetti()

type ConfettiPiece = {
  x: number; y: number; w: number; h: number;
  color: string; vx: number; vy: number;
  rot: number; rotV: number; life: number;
};

let _confettiCanvas: HTMLCanvasElement | null = null;
let _confettiCtx: CanvasRenderingContext2D | null = null;
let _confettiPieces: ConfettiPiece[] = [];
let _confettiFrame: number | null = null;
const _CONFETTI_COLORS = ['#667eea', '#764ba2', '#16a34a', '#f59e0b', '#ec4899', '#06b6d4'];

function _ensureConfettiCanvas() {
  if (_confettiCanvas) return;
  _confettiCanvas = document.createElement('canvas');
  _confettiCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
  _confettiCanvas.width = window.innerWidth;
  _confettiCanvas.height = window.innerHeight;
  document.body.appendChild(_confettiCanvas);
  _confettiCtx = _confettiCanvas.getContext('2d');
  window.addEventListener('resize', () => {
    if (_confettiCanvas) {
      _confettiCanvas.width = window.innerWidth;
      _confettiCanvas.height = window.innerHeight;
    }
  });
}

function _animateConfetti() {
  if (!_confettiCanvas || !_confettiCtx) return;
  _confettiCtx.clearRect(0, 0, _confettiCanvas.width, _confettiCanvas.height);
  _confettiPieces = _confettiPieces.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06;
    p.rot += p.rotV;
    p.life -= 0.004;
    if (p.life <= 0 || p.y > _confettiCanvas!.height + 20) return false;
    _confettiCtx!.save();
    _confettiCtx!.translate(p.x, p.y);
    _confettiCtx!.rotate((p.rot * Math.PI) / 180);
    _confettiCtx!.globalAlpha = Math.min(p.life, 1);
    _confettiCtx!.fillStyle = p.color;
    _confettiCtx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    _confettiCtx!.restore();
    return true;
  });
  if (_confettiPieces.length > 0) {
    _confettiFrame = requestAnimationFrame(_animateConfetti);
  } else {
    _confettiCtx.clearRect(0, 0, _confettiCanvas.width, _confettiCanvas.height);
    _confettiFrame = null;
  }
}

export function fireConfetti(count: number) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  _ensureConfettiCanvas();
  if (!_confettiCanvas) return;
  for (let i = 0; i < count; i++) {
    _confettiPieces.push({
      x: Math.random() * _confettiCanvas.width,
      y: -10 - Math.random() * 40,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: _CONFETTI_COLORS[Math.floor(Math.random() * _CONFETTI_COLORS.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 3,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 12,
      life: 1
    });
  }
  if (!_confettiFrame) _animateConfetti();
}
