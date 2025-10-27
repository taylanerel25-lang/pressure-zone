const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let innerWidth, innerHeight;

// player MUST exist before resize() runs
const player = { x: 0, y: 0, vy: 0, r: 18 };

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width  = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  innerWidth  = window.innerWidth;
  innerHeight = window.innerHeight;

  // safe now
  player.x = innerWidth * 0.5;
  player.y = innerHeight * 0.5;
}
window.addEventListener('resize', resize, { passive:true });
resize();

let lastTapTime = 0;
const DEBOUNCE_MS = 60;

function handleTap() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    const now = Date.now();
    if (now - lastTapTime < DEBOUNCE_MS) return;
    lastTapTime = now;

    if (state === 'menu' || state === 'gameover') {
        resetGame();
        startGame();
    }

    if (state === 'playing') {
        player.vy += TAP_IMPULSE;
        playSound('tap');
    }
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const x = e.clientX, y = e.clientY;

  // top-left 50×50 toggles mute ONLY
  if (x < 50 && y < 50) { toggleMute(); return; }

  handleTap();
}, { passive:false });

document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        handleTap();
    }
});

const GRAVITY = 1200;
const TAP_IMPULSE = -360;
const MAX_FALL = 680;
const MAX_RISE = -480;
const SAFE_MARGIN_Y = 64;

let obstacles = [];
let score = 0;
let best = parseInt(localStorage.getItem('PZ_BEST_V1')) || 0;
let state = 'menu';
let spawnTimer = 0;
let speed = 280;
let spawnEvery = 1.25;
let gapH = Math.max(140, window.innerHeight * 0.22);
let flashAlpha = 0;
let flashDuration = 200;
let flashStart = 0;
let t = 0;

let mute = localStorage.getItem('PZ_MUTE') === 'true';
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (mute) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    let freq, dur, vol, wave;
    if (type === 'tap') {
        freq = 650; dur = 0.04; vol = 0.08; wave = 'sine';
    } else if (type === 'pass') {
        freq = 750; dur = 0.05; vol = 0.12; wave = 'square';
    } else if (type === 'death') {
        freq = 180; dur = 0.16; vol = 0.25; wave = 'sawtooth';
    }
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + dur);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}

function toggleMute() {
    mute = !mute;
    localStorage.setItem('PZ_MUTE', mute);
}

let starsA = [];
let starsB = [];
function initStars() {
    starsA = [];
    starsB = [];
    for (let i = 0; i < 60; i++) {
        starsA.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 1 + Math.random() });
    }
    for (let i = 0; i < 30; i++) {
        starsB.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 1.5 + Math.random() * 1.5 });
    }
}

initStars();

function updateStars(dt) {
    starsA.forEach(s => {
        s.x -= 20 * dt;
        if (s.x < 0) {
            s.x = innerWidth + Math.random() * 20;
            s.y = Math.random() * innerHeight;
        }
    });
    starsB.forEach(s => {
        s.x -= 40 * dt;
        if (s.x < 0) {
            s.x = innerWidth + Math.random() * 40;
            s.y = Math.random() * innerHeight;
        }
    });
}

function drawStars(stars, alpha) {
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = alpha;
    stars.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

let trail = [];
const TRAIL_LENGTH = 20;

function updateTrail() {
    trail.push(player.y);
    if (trail.length > TRAIL_LENGTH) trail.shift();
}

function drawTrail() {
    if (trail.length === 0) return;
    ctx.strokeStyle = '#fff';
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.moveTo(player.x, trail[0]);
    for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(player.x, trail[i]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function roundRectPath(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w,y, x+w,y+h, r);
  ctx.arcTo(x+w,y+h, x,y+h, r);
  ctx.arcTo(x,y+h, x,y, r);
  ctx.arcTo(x,y, x+w,y, r);
  ctx.closePath();
}

function drawUFO() {
    // Saucer rim
    ctx.fillStyle = '#ddd';
    roundRectPath(player.x - 20, player.y - 4, 40, 8, 4);
    ctx.fill();
    // Dome
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(player.x, player.y - 6, 12, 0, Math.PI * 2);
    ctx.fill();
    // Glow
    ctx.strokeStyle = '#fff';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function spawnObstacle() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const width = innerWidth * 0.66;
    const x = dir > 0 ? -width : innerWidth + width;
    const margin = 64;
    const gapY = rand(margin + gapH / 2, innerHeight - margin - gapH / 2);
    obstacles.push({ dir, x, speed, gapY, gapH, width, seed: Math.random() * 10, _crossed: false });
}

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function updateObstacles(dt) {
    obstacles.forEach(o => {
        const lineX = innerWidth * 0.5;

        // before moving:
        const prevCenter = o.x + (o.dir > 0 ? o.width * 0.5 : -o.width * 0.5);

        // move
        o.x += o.dir * o.speed * dt;

        // gentle drift + clamp
        o.gapY += Math.sin((t * 0.6) + o.seed) * 12 * dt;
        const margin = SAFE_MARGIN_Y + o.gapH/2;
        o.gapY = Math.max(margin, Math.min(innerHeight - margin, o.gapY));

        const center = o.x + (o.dir > 0 ? o.width * 0.5 : -o.width * 0.5);

        if (!o._crossed && Math.sign(prevCenter - lineX) !== Math.sign(center - lineX)) {
          o._crossed = true;
          const gapTop = o.gapY - o.gapH/2, gapBot = o.gapY + o.gapH/2;
          if (player.y >= gapTop && player.y <= gapBot) {
            score++; playSound('pass');
            if (score > best) { best = score; localStorage.setItem('PZ_BEST_V1', best); }
            if (score % 5 === 0) { speed = Math.min(520, speed + 8); spawnEvery = Math.max(0.72, spawnEvery - 0.02); gapH = Math.max(90, gapH - 4); }
          } else {
            gameOver();
          }
        }
    });
    obstacles = obstacles.filter(o => {
        if (o.dir > 0) return o.x < innerWidth;
        else return o.x > 0;
    });
}

function drawObstacles() {
    obstacles.forEach(o => {
        let barLeft = o.x;
        if (o.dir < 0) barLeft = o.x - o.width;
        const top = 0;
        const bottom = innerHeight;
        const gapTop = o.gapY - o.gapH / 2;
        const gapBottom = o.gapY + o.gapH / 2;
        ctx.fillStyle = '#9aa3ad';
        // Top bar
        ctx.fillRect(barLeft, top, o.width, gapTop - top);
        // Bottom bar
        ctx.fillRect(barLeft, gapBottom, o.width, bottom - gapBottom);
        // Highlight
        ctx.strokeStyle = '#fff';
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(barLeft + 4, gapTop);
        ctx.lineTo(barLeft + o.width - 4, gapTop);
        ctx.moveTo(barLeft + 4, gapBottom);
        ctx.lineTo(barLeft + o.width - 4, gapBottom);
        ctx.stroke();
        ctx.globalAlpha = 1;
    });
}

function gameOver() {
    state = 'gameover';
    playSound('death');
    flashStart = performance.now();
    flashAlpha = 0.35;
}

function updateFlash(dt) {
    if (flashAlpha > 0) {
        const elapsed = performance.now() - flashStart;
        flashAlpha = 0.35 * (1 - elapsed / flashDuration);
        if (flashAlpha < 0) flashAlpha = 0;
    }
}

function drawFlash() {
    if (flashAlpha > 0) {
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = flashAlpha;
        ctx.fillRect(0, 0, innerWidth, innerHeight);
        ctx.globalAlpha = 1;
    }
}

function drawHUD() {
    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(score, innerWidth * 0.5, 60);
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`BEST ${best}`, innerWidth - 20, 40);
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mute ? '🔇' : '🔊', 20, 40);
}

function drawOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    if (state === 'menu') {
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText('PRESSURE ZONE', innerWidth * 0.5, innerHeight * 0.4);
        ctx.font = '24px sans-serif';
        ctx.fillText('Tap to start · Tap to rise · Dodge the junk', innerWidth * 0.5, innerHeight * 0.5);
    } else if (state === 'gameover') {
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(score, innerWidth * 0.5, innerHeight * 0.4);
        ctx.font = '24px sans-serif';
        ctx.fillText(`BEST ${best}`, innerWidth * 0.5, innerHeight * 0.45);
        ctx.fillText('Tap to retry', innerWidth * 0.5, innerHeight * 0.5);
    }
}

function startGame() {
    state = 'playing';
    spawnTimer = spawnEvery; // Spawn first immediately-ish
}

function resetGame() {
    obstacles = [];
    score = 0;
    spawnTimer = 0;
    speed = 280;
    spawnEvery = 1.25;
    gapH = Math.max(140, innerHeight * 0.22);
    player.y = innerHeight * 0.5;
    player.vy = 0;
    trail = [];
    flashAlpha = 0;
}

let lastTime = 0;
function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = Math.min(dt, 0.033);
    t += dt;

    if (state === 'playing') {
        player.vy += GRAVITY * dt;
        if (player.vy > MAX_FALL) player.vy = MAX_FALL;
        if (player.vy < MAX_RISE) player.vy = MAX_RISE;
        player.y += player.vy * dt;

        if (player.y - player.r < 0 || player.y + player.r > innerHeight) {
            gameOver();
        }

        spawnTimer += dt;
        if (spawnTimer >= spawnEvery) {
            spawnTimer = 0;
            spawnObstacle();
        }

        updateObstacles(dt);
        updateTrail();
    }

    updateStars(dt);
    updateFlash(dt);

    ctx.clearRect(0, 0, innerWidth, innerHeight);

    drawStars(starsA, 0.5);
    drawStars(starsB, 0.8);

    drawObstacles();

    drawTrail();
    drawUFO();

    drawHUD();

    if (state !== 'playing') {
        drawOverlay();
    }

    drawFlash();

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
