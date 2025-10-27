/* PRESSURE ZONE — tap to rise, bars from both sides */

(() => {
  // ---- setup ---------------------------------------------------------------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let vw = 0, vh = 0;

  // player MUST exist before resize()
  const player = { x: 0, y: 0, vy: 0, r: 18 };

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width  = Math.floor(window.innerWidth  * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    vw = window.innerWidth; vh = window.innerHeight;
    player.x = vw * 0.5; player.y = vh * 0.5;
    initStars(); // rebuild star positions for new size
  }
  addEventListener('resize', resize, { passive:true });
  resize();

  const rand   = (a,b)=>Math.random()*(b-a)+a;
  const clamp  = (v,a,b)=>Math.max(a,Math.min(b,v));

  // ---- audio ---------------------------------------------------------------
  let audioCtx = null;
  let mute = localStorage.getItem('PZ_MUTE') === 'true';
  function ensureAudio(){ if(!audioCtx){ try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(audioCtx && audioCtx.state==='suspended') audioCtx.resume(); }
  function playSound(type){
    if(mute || !audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    let f=650,d=.04,v=.08,w='sine';
    if(type==='pass'){ f=750; d=.05; v=.12; w='square'; }
    if(type==='die'){  f=180; d=.16; v=.25; w='sawtooth'; }
    o.type=w; o.frequency.value=f; g.gain.value=v;
    const t = audioCtx.currentTime; o.start(t); o.stop(t+d);
    g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  }
  function toggleMute(){ mute = !mute; localStorage.setItem('PZ_MUTE', mute); }

  // ---- stars ---------------------------------------------------------------
  const starsA=[], starsB=[];
  function initStars(){
    starsA.length=0; starsB.length=0;
    for(let i=0;i<60;i++) starsA.push({x:Math.random()*vw,y:Math.random()*vh});
    for(let i=0;i<30;i++) starsB.push({x:Math.random()*vw,y:Math.random()*vh});
  }
  function drawStars(dt){
    // hard background to avoid alpha weirdness
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,vw,vh);

    ctx.fillStyle = 'rgba(230,240,255,.55)';
    for(const s of starsA){ s.x -= 20*dt; if(s.x<-2){ s.x += vw+2; s.y=Math.random()*vh; } ctx.fillRect(s.x,s.y,1.5,1.5); }

    ctx.fillStyle = 'rgba(230,240,255,.9)';
    for(const s of starsB){ s.x -= 40*dt; if(s.x<-2){ s.x += vw+2; s.y=Math.random()*vh; } ctx.fillRect(s.x,s.y,2.2,2.2); }
  }

  // ---- physics & state -----------------------------------------------------
  const GRAVITY=1200, TAP_IMPULSE=-360, MAX_FALL=680, MAX_RISE=-480, SAFE_MARGIN_Y=64;

  let state='menu', score=0, best=parseInt(localStorage.getItem('PZ_BEST_V1')||'0',10);
  let speed=280, spawnEvery=1.25, gapH=Math.max(140, vh*0.22), spawnTimer=0, t=0;
  let flash=0;

  function resetGame(){
    score=0; speed=280; spawnEvery=1.25; gapH=Math.max(140, vh*0.22); spawnTimer=0;
    player.y = vh*0.5; player.vy = 0; obstacles.length=0; trail.length=0; flash=0;
  }
  function startGame(){ state='playing'; spawnTimer = spawnEvery*0.6; }
  function gameOver(){
    if(state!=='playing') return;
    state='gameover'; flash=0.25; playSound('die');
    if(score>best){ best=score; localStorage.setItem('PZ_BEST_V1',best); }
  }

  // ---- input ---------------------------------------------------------------
  let lastTapAt=0; const DEBOUNCE=60;
  canvas.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    const x=e.clientX,y=e.clientY;
    // top-left corner toggles mute only
    if(x<50&&y<50){ toggleMute(); return; }
    ensureAudio();
    const now=performance.now(); if(now-lastTapAt<DEBOUNCE) return; lastTapAt=now;
    if(state==='menu'){ resetGame(); startGame(); return; }
    if(state==='gameover'){ resetGame(); startGame(); return; }
    player.vy += TAP_IMPULSE; playSound('tap');
  }, {passive:false});
  addEventListener('keydown', e=>{ if(e.code==='Space'||e.code==='ArrowUp'){ e.preventDefault(); canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:60,clientY:60})); }});

  // ---- obstacles -----------------------------------------------------------
  const obstacles=[];
  function spawnObstacle(){
    const dir = Math.random()<0.5 ? +1 : -1;     // +1 left→right, -1 right→left
    const width = vw * 0.66;
    const x = dir>0 ? -width : vw + width;
    const gy = rand(SAFE_MARGIN_Y+gapH/2, vh - SAFE_MARGIN_Y - gapH/2);
    obstacles.push({ dir, x, width, gapY:gy, gapH, speed, seed:Math.random()*10, crossed:false });
  }
  function updateObstacles(dt){
    const lineX = vw*0.5;
    for(let i=obstacles.length-1;i>=0;i--){
      const o = obstacles[i];
      const prevCenter = o.x + (o.dir>0 ? o.width*0.5 : -o.width*0.5);
      o.x += o.dir * o.speed * dt;
      // gentle vertical drift + clamp
      o.gapY += Math.sin((t*0.6)+o.seed) * 12 * dt;
      const m = SAFE_MARGIN_Y + o.gapH/2;
      o.gapY = clamp(o.gapY, m, vh-m);

      const center = o.x + (o.dir>0 ? o.width*0.5 : -o.width*0.5);
      if(!o.crossed && Math.sign(prevCenter-lineX)!==Math.sign(center-lineX)){
        o.crossed = true;
        const top = o.gapY - o.gapH/2, bot = o.gapY + o.gapH/2;
        if(player.y>=top && player.y<=bot){
          score++; playSound('pass');
          if(score%5===0){ speed=Math.min(520,speed+8); spawnEvery=Math.max(0.72,spawnEvery-0.02); gapH=Math.max(90,gapH-4); }
        }else{
          gameOver();
        }
      }

      // cull once fully off-screen
      if( (o.dir>0 && o.x>vw+o.width) || (o.dir<0 && o.x<-o.width) ) obstacles.splice(i,1);
    }
  }
  function drawObstacles(){
    ctx.fillStyle = '#9aa3ad';
    for(const o of obstacles){
      let left = (o.dir>0) ? o.x : o.x - o.width;
      const top = 0, bottom = vh, gapTop = o.gapY - o.gapH/2, gapBot = o.gapY + o.gapH/2;
      // top segment
      ctx.fillRect(left, top, o.width, gapTop-top);
      // bottom segment
      ctx.fillRect(left, gapBot, o.width, bottom-gapBot);
      // gap highlights
      ctx.strokeStyle='rgba(255,255,255,.25)';
      ctx.beginPath();
      ctx.moveTo(left+4, gapTop); ctx.lineTo(left+o.width-4, gapTop);
      ctx.moveTo(left+4, gapBot); ctx.lineTo(left+o.width-4, gapBot);
      ctx.stroke();
    }
  }

  // ---- ufo & trail ---------------------------------------------------------
  const trail=[]; const TRAIL_LEN=20;
  function updateTrail(){ trail.push(player.y); if(trail.length>TRAIL_LEN) trail.shift(); }
  function roundRectPath(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
  function drawUFO(){
    // trail
    if(trail.length){
      ctx.strokeStyle='#ffffff'; ctx.globalAlpha=0.12;
      ctx.beginPath(); ctx.moveTo(player.x, trail[0]);
      for(let i=1;i<trail.length;i++) ctx.lineTo(player.x, trail[i]);
      ctx.stroke(); ctx.globalAlpha=1;
    }
    // saucer rim
    ctx.fillStyle='#aab3c0'; roundRectPath(player.x-20, player.y-4, 40, 8, 4); ctx.fill();
    // dome
    ctx.beginPath(); ctx.arc(player.x, player.y-6, 12, 0, Math.PI*2); ctx.fillStyle='#e6f0ff'; ctx.fill();
    // glow line
    ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(player.x-18, player.y); ctx.lineTo(player.x+18, player.y); ctx.stroke();
  }

  // ---- overlay / hud -------------------------------------------------------
  function drawHUD(){
    ctx.font='900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle='#fff'; ctx.textAlign='center';
    ctx.fillText(String(score), vw*0.5, 56);
    ctx.font='700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign='right'; ctx.fillText('BEST '+best, vw-16, 30);
    ctx.textAlign='left';  ctx.fillText(mute?'🔇':'🔊', 14, 30);
  }
  function drawOverlay(){
    ctx.fillStyle='rgba(0,0,0,.7)'; ctx.fillRect(0,0,vw,vh);
    ctx.fillStyle='#fff'; ctx.textAlign='center';
    if(state==='menu'){
      ctx.font='900 40px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('PRESSURE ZONE', vw*0.5, vh*0.40);
      ctx.font='600 20px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Tap to start · Tap to rise · Dodge the junk', vw*0.5, vh*0.50);
    } else if(state==='gameover'){
      ctx.font='900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(String(score), vw*0.5, vh*0.40);
      ctx.font='600 20px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('BEST '+best, vw*0.5, vh*0.47);
      ctx.fillText('Tap to retry', vw*0.5, vh*0.54);
    }
  }

  // ---- loop ----------------------------------------------------------------
  let last = performance.now();
  function loop(now){
    let dt = (now-last)/1000; last = now; dt = Math.min(0.033, Math.max(0, dt)); t += dt;

    // update
    if(state==='playing'){
      player.vy += GRAVITY*dt;
      if(player.vy>MAX_FALL) player.vy=MAX_FALL;
      if(player.vy<MAX_RISE) player.vy=MAX_RISE;
      player.y  += player.vy*dt;

      if(player.y-player.r<0 || player.y+player.r>vh){ gameOver(); }

      spawnTimer += dt;
      if(spawnTimer>=spawnEvery){ spawnTimer=0; spawnObstacle(); }

      updateObstacles(dt);
      updateTrail();
    }

    // draw
    drawStars(dt);
    drawObstacles();
    drawUFO();
    drawHUD();

    if(state!=='playing') drawOverlay();

    if(flash>0){
      ctx.globalAlpha = Math.min(0.35, flash*1.8);
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,vw,vh);
      ctx.globalAlpha = 1;
      flash -= dt;
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
