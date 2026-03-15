import { useEffect, useRef, useState } from "react";

// ── Constants ───────────────────────────────────────────────────
const W = 680, H = 440, SHIP_X = 220;
const GRAVITY = 0.14, THRUST = -0.18, MAX_VY = 3.8, DAMPING = 0.985;

// ── Ship Skins ─────────────────────────────────────────────────
const SKINS = [
  { name:"CYAN HAWK",       h1:"#c8e8ff",h2:"#ffffff",h3:"#a0cfee",wing:"#00ccff",wAccent:"rgba(0,240,255,0.65)",eR:0,  eG:230,eB:255,shadow:"#00FFFF" },
  { name:"GOLD RUSH",       h1:"#ffd080",h2:"#fffacc",h3:"#e8c060",wing:"#ffaa00",wAccent:"rgba(255,170,0,0.65)",  eR:255,eG:179,eB:0,  shadow:"#FFD700" },
  { name:"CRIMSON SPECTRE", h1:"#ff8888",h2:"#ffbbbb",h3:"#ff5555",wing:"#ff4444",wAccent:"rgba(255,68,68,0.65)",  eR:255,eG:50, eB:50, shadow:"#FF4444" },
  { name:"JADE PHANTOM",    h1:"#80ffcc",h2:"#ccffee",h3:"#55ffaa",wing:"#00ff99",wAccent:"rgba(0,255,170,0.65)",  eR:0,  eG:230,eB:160,shadow:"#00FF99" },
  { name:"VOID SHADOW",     h1:"#cc88ff",h2:"#eec8ff",h3:"#aa55ff",wing:"#9900ff",wAccent:"rgba(187,68,255,0.65)", eR:187,eG:68, eB:255,shadow:"#BB44FF" },
];

// ── Trail Palettes ─────────────────────────────────────────────
const TRAIL_DEFS = [
  { name:"ICE WAKE",     fn:(t,i,heat)=>`rgba(0,${Math.floor(195+heat*35)},255,${t*0.42})` },
  { name:"SOLAR FLARE",  fn:(t,i)    =>`rgba(255,${Math.floor(130+i*4)},0,${t*0.38})` },
  { name:"PHANTOM WAKE", fn:(t,i)    =>`rgba(${Math.floor(160+i*3)},0,255,${t*0.40})` },
];

// ── Zones ──────────────────────────────────────────────────────
const ZONES = [
  { name:"DEEP SPACE", thresh:0,  vig:"rgba(0,0,20,0.65)",    obsRim:null,                  starMult:1.0 },
  { name:"NEBULA",     thresh:4,  vig:"rgba(20,0,35,0.65)",   obsRim:"rgba(255,180,0,0.18)",starMult:1.0 },
  { name:"VOID CORE",  thresh:10, vig:"rgba(30,0,0,0.72)",    obsRim:"rgba(255,0,0,0.22)",  starMult:1.2 },
];

// ── Tiers ───────────────────────────────────────────────────────
const TIERS = [
  { name:"CADET",       min:0   },
  { name:"PILOT",       min:15  },
  { name:"ACE",         min:40  },
  { name:"VOID RUNNER", min:80  },
  { name:"SPECTRE",     min:140 },
  { name:"LEGEND",      min:220 },
];
function getTier(s){ let t=TIERS[0]; for(const r of TIERS){ if(s>=r.min)t=r; else break; } return t; }
function getNextTier(s){ for(const r of TIERS){ if(s<r.min) return r; } return null; }

// ── Micro goals ─────────────────────────────────────────────────
const GOALS = [
  { desc:"Survive 10 seconds", key:"survival", target:10 },
  { desc:"Pass 3 gates clean", key:"clean",    target:3  },
  { desc:"Score 20 points",    key:"score",    target:20 },
  { desc:"Get a 3× streak",    key:"streak",   target:3  },
  { desc:"Collect a pickup",   key:"pickups",  target:1  },
  { desc:"Pass 8 gates",       key:"clean",    target:8  },
  { desc:"Score 50 points",    key:"score",    target:50 },
  { desc:"Survive 30 seconds", key:"survival", target:30 },
  { desc:"Get a 8× streak",    key:"streak",   target:8  },
];

// ── Daily challenge ─────────────────────────────────────────────
const DAILIES = [
  { desc:"Survive 45 seconds",  key:"survival", target:45 },
  { desc:"Pass 12 gates clean", key:"clean",    target:12 },
  { desc:"Score 60 points",     key:"score",    target:60 },
  { desc:"Reach a 5× streak",   key:"streak",   target:5  },
  { desc:"Collect 5 pickups",   key:"pickups",  target:5  },
];
function getDaily(){ const d=new Date(), seed=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate(); return DAILIES[seed%DAILIES.length]; }

// ── Persistence ─────────────────────────────────────────────────
const SAVE_VER = 2;
function load(){
  try{
    const d=JSON.parse(localStorage.getItem("voidrun")||"{}");
    if(!d.saveVer||d.saveVer<SAVE_VER){
      if(!d.unlockedSkins)             d.unlockedSkins=[0];
      if(d.activeSkin==null)           d.activeSkin=0;
      if(!d.unlockedTrails)            d.unlockedTrails=[0];
      if(d.activeTrail==null)          d.activeTrail=0;
      if(d.activeZone==null)           d.activeZone=0;
      if(d.decentRunCount==null)       d.decentRunCount=0;
      if(d.graduatedOnboarding==null)  d.graduatedOnboarding=false;
      if(!d.ghostPath)                 d.ghostPath=null;
      if(!d.ghostScoreBySecond)        d.ghostScoreBySecond=null;
      d.saveVer=SAVE_VER;
    }
    return d;
  }catch{ return {}; }
}
function saveToDisk(d){ try{ localStorage.setItem("voidrun",JSON.stringify({...d,saveVer:SAVE_VER})); }catch{} }

// ─────────────────────────────────────────────────────────────────
export default function App(){
  const canvasRef = useRef(null);
  const [ui, setUi] = useState({
    state:"idle", score:0, best:0, streak:0, multiplier:1, shielded:false,
    tier:"CADET", nextTier:"PILOT", nextMin:15, dailyDone:false,
    ds:0, dStreak:0, dSurvival:0, dClean:0, dTip:"",
    newBest:false, delta:0, pbStreak:0, pbSurvival:0,
    deathOverlay:false,
  });

  useEffect(()=>{
    const canvas=canvasRef.current, ctx=canvas.getContext("2d");
    let raf, pressing=false;

    // ── Audio ────────────────────────────────────────────────
    let AC=null, engOsc=null, engGain=null;
    function initAudio(){
      if(AC) return;
      try{
        AC=new(window.AudioContext||window.webkitAudioContext)();
        engOsc=AC.createOscillator(); engGain=AC.createGain();
        const f=AC.createBiquadFilter(); f.type="lowpass"; f.frequency.value=500;
        engOsc.connect(f); f.connect(engGain); engGain.connect(AC.destination);
        engOsc.type="sawtooth"; engOsc.frequency.value=60; engGain.gain.value=0; engOsc.start();
      }catch(e){}
    }
    function tone(freq,dur,type="sine",vol=0.09){
      if(!AC) return;
      try{
        const o=AC.createOscillator(), g=AC.createGain();
        o.connect(g); g.connect(AC.destination);
        o.type=type; o.frequency.value=freq;
        g.gain.setValueAtTime(vol,AC.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+dur);
        o.start(); o.stop(AC.currentTime+dur);
      }catch(e){}
    }
    function sndGate(sk){ tone(380+sk*32,0.09,"sine",0.07); if(sk>2) tone((380+sk*32)*1.5,0.07,"sine",0.04); }
    function sndPickup(){ tone(660,0.1,"sine",0.09); setTimeout(()=>tone(880,0.1,"sine",0.07),80); }
    function sndNear(){ tone(180,0.2,"sawtooth",0.05); }
    function sndDie(){ tone(95,0.5,"sawtooth",0.13); setTimeout(()=>tone(65,0.6,"sawtooth",0.08),120); }
    function sndCheer(){ [523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,0.1,"sine",0.09),i*100)); }
    function sndUnlock(){ [660,880,1100].forEach((f,i)=>setTimeout(()=>tone(f,0.12,"sine",0.08),i*120)); }
    function setHum(spd,on){ if(!AC||!engOsc)return; try{ engOsc.frequency.setTargetAtTime(55+(spd-1.6)*65,AC.currentTime,0.3); engGain.gain.setTargetAtTime(on?0.04+(spd-1.6)*0.015:0,AC.currentTime,0.2); }catch(e){} }

    // ── Saved data ───────────────────────────────────────────
    const sv=load();
    let bScore=sv.bScore||0, bStreak=sv.bStreak||0, bSurvival=sv.bSurvival||0, bClean=sv.bClean||0;
    let totalRuns=sv.totalRuns||0, recentRuns=sv.recentRuns||[];
    let diffMod=sv.diffMod||0;
    let dDate=sv.dDate||"", dDone=sv.dDone||false;
    const todayStr=new Date().toDateString();
    if(dDate!==todayStr){ dDone=false; dDate=todayStr; }

    // ── Cosmetics (mutable, persisted via sv) ────────────────
    let unlockedSkins  = sv.unlockedSkins  || [0];
    let activeSkin     = sv.activeSkin     || 0;
    let unlockedTrails = sv.unlockedTrails || [0];
    let activeTrail    = sv.activeTrail    || 0;
    let activeZone     = sv.activeZone     || 0;
    let decentRunCount = sv.decentRunCount || 0;
    let graduatedOnboarding = sv.graduatedOnboarding || false;
    let consecutiveAbove = 0;

    // ── Ghost run ────────────────────────────────────────────
    let ghostPath           = sv.ghostPath           || null;
    let ghostScoreBySecond  = sv.ghostScoreBySecond  || null;
    let ghostRecord         = [];
    let ghostScoreRecord    = [];
    let lastGhostSecond     = -1;

    // ── Idle swatch hitboxes (rebuilt each idle frame) ───────
    let swatchHitboxes = [];

    // ── Save helper ──────────────────────────────────────────
    function persist(){
      saveToDisk({
        bScore,bStreak,bSurvival,bClean,totalRuns,recentRuns,diffMod,dDate,dDone,
        unlockedSkins,activeSkin,unlockedTrails,activeTrail,activeZone,
        decentRunCount,graduatedOnboarding,
        ghostPath,ghostScoreBySecond,
      });
    }

    // ── Adaptive difficulty ──────────────────────────────────
    function updateDiff(score){
      recentRuns.push(score); if(recentRuns.length>8) recentRuns.shift();
      const avg=recentRuns.reduce((a,b)=>a+b,0)/recentRuns.length;

      // Graduate onboarding when player clears threshold once
      if(!graduatedOnboarding&&(score>=25||survTime>=30)){
        graduatedOnboarding=true;
      }

      if(!graduatedOnboarding){
        // Onboarding: keep gaps wide until player proves basic competence
        diffMod=Math.max(-0.7, diffMod-0.2);
      } else if(avg<8){
        consecutiveAbove=0; diffMod=Math.max(-1,   diffMod-0.25);
      } else if(avg<20){
        consecutiveAbove=0; diffMod=Math.max(-0.5, diffMod-0.06);
      } else if(avg>50){
        // Hysteresis: tighten only after 2 consecutive above-avg runs
        consecutiveAbove++;
        if(consecutiveAbove>=2)
          diffMod=Math.min(avg>80?1.2:1.0, diffMod+(avg>80?0.15:0.10));
      } else {
        consecutiveAbove=0; diffMod*=0.93;
      }

      if(score>=20){
        decentRunCount++;
        // Zone progression
        if(decentRunCount===4)  setTimeout(()=>bn("★ NEBULA ZONE UNLOCKED — IDLE TO SELECT","#cc88ff",220),800);
        if(decentRunCount===10) setTimeout(()=>bn("★ VOID CORE UNLOCKED — IDLE TO SELECT","#FF4444",220),800);
      }
    }
    function adaptGAP(wide){ return Math.max(118, 156+diffMod*(-32)+Math.random()*36+(wide?42:0)); }

    // ── Cosmetic unlock check ────────────────────────────────
    function checkUnlocks(dispScore, bestStrRun, sTime){
      const queue=[];
      if(dispScore>=25  &&!unlockedSkins.includes(1))  { unlockedSkins.push(1);  queue.push(["✦ GOLD RUSH SKIN UNLOCKED","#FFD700"]); }
      if(bestStrRun>=8  &&!unlockedSkins.includes(2))  { unlockedSkins.push(2);  queue.push(["✦ CRIMSON SPECTRE UNLOCKED","#FF4444"]); }
      if(sTime>=45      &&!unlockedSkins.includes(3))  { unlockedSkins.push(3);  queue.push(["✦ JADE PHANTOM UNLOCKED","#00FF99"]); }
      if(dispScore>=140 &&!unlockedSkins.includes(4))  { unlockedSkins.push(4);  queue.push(["✦ VOID SHADOW UNLOCKED","#BB44FF"]); }
      if(dispScore>=60  &&!unlockedTrails.includes(1)) { unlockedTrails.push(1); queue.push(["✦ SOLAR FLARE TRAIL UNLOCKED","#FFB300"]); }
      if(dispScore>=100 &&!unlockedTrails.includes(2)) { unlockedTrails.push(2); queue.push(["✦ PHANTOM WAKE TRAIL UNLOCKED","#BB44FF"]); }
      // Show banners sequentially so none stomp each other
      queue.forEach(([msg,col],i)=>{ setTimeout(()=>{ bn(msg,col,160); sndUnlock(); }, i*320+600); });
    }

    // ── Game vars ────────────────────────────────────────────
    let state="idle", shipY=H/2, shipVY=0;
    let trail=[], obstacles=[], pickups=[], particles=[];
    let tick=0, rawScore=0, speed=1.6;
    let spawnT=0, spawnI=155, deathT=0, engFlick=0;
    let streak=0, bestStrRun=0, cleanPasses=0, survTime=0, pickupsColl=0;
    let mult=1, multT=0, shielded=false, shieldT=0;
    let goalIdx=0, goalDone=false;
    let nearFlash=0, shake=0, closestPx=999, closeShow=0;
    let heat=0, obstCount=0;
    let bnMsg="", bnT=0, bnCol="#00FFFF";
    let uiThrottle=0;
    let pbPaceShow=0, pbPaceAhead=false;

    function bn(msg,col="#00FFFF",dur=85){ bnMsg=msg; bnT=dur; bnCol=col; }

    // Stars — 3 depth layers
    const stars=Array.from({length:210},()=>({
      x:Math.random()*W, y:Math.random()*H,
      r:Math.random()*1.3+0.1, spd:Math.random()*0.4+0.05,
      a:Math.random()*0.5+0.1, tw:Math.random()*Math.PI*2,
      layer:Math.floor(Math.random()*3),
    }));

    // Nebula blobs (zone 1+)
    const nebulae=Array.from({length:9},()=>({
      x:Math.random()*W, y:Math.random()*H,
      r:40+Math.random()*55, spd:0.07+Math.random()*0.11,
    }));

    // ── Reset ────────────────────────────────────────────────
    function reset(){
      shipY=H/2; shipVY=0; trail=[]; obstacles=[]; pickups=[]; particles=[];
      tick=0; rawScore=0; speed=1.6; spawnT=0; spawnI=155; deathT=0;
      streak=0; bestStrRun=0; cleanPasses=0; survTime=0; pickupsColl=0;
      mult=1; multT=0; shielded=false; shieldT=0;
      goalIdx=0; goalDone=false;
      nearFlash=0; shake=0; closestPx=999; closeShow=0;
      heat=0; obstCount=0; bnMsg=""; bnT=0;
      pbPaceShow=0; pbPaceAhead=false;
      ghostRecord=[]; ghostScoreRecord=[]; lastGhostSecond=-1;
      totalRuns++;
    }

    // ── Spawn obstacle ───────────────────────────────────────
    function spawnObs(){
      const phase=Math.floor(obstCount/6)%4;
      const wide=phase===1, drift=phase===2;
      const GAP=adaptGAP(wide);
      const gapY=50+Math.random()*(H-GAP-100);
      obstacles.push({x:W+28, gapY, baseGapY:gapY, GAP, drift, dDir:Math.random()>0.5?1:-1, dOff:0, scored:false, nearMissed:false});
      obstCount++;
      if(Math.random()<0.33){
        const type=Math.random()<0.5?"score":Math.random()<0.6?"mult":"shield";
        const risk=Math.random();
        const py=risk<0.38 ? gapY+GAP/2 : risk<0.65 ? gapY+GAP*0.2 : gapY+GAP*0.8;
        pickups.push({x:W+28, y:py, type, collected:false, pulse:0});
      }
    }

    // ── Particles ────────────────────────────────────────────
    function explode(x,y){
      for(let i=0;i<58;i++){
        const a=Math.random()*Math.PI*2, s=Math.random()*6.5+0.8;
        particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2.4,
          life:1,decay:0.008+Math.random()*0.012,size:2+Math.random()*5,
          hue:i%3===0?"cyan":i%3===1?"orange":"white"});
      }
    }
    function burst(x,y,n=10){
      for(let i=0;i<n;i++){
        const a=Math.random()*Math.PI*2, s=Math.random()*3+0.5;
        particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
          life:0.7,decay:0.026+Math.random()*0.02,size:1+Math.random()*3,hue:"cyan"});
      }
    }

    // ── Draw ship (skin-aware) ────────────────────────────────
    function drawShip(x,y,vy,alpha,skinIdx){
      const si = skinIdx!=null ? skinIdx : activeSkin;
      const sk = SKINS[si] || SKINS[0];
      const tilt=Math.max(-0.28,Math.min(0.28,vy*0.045));
      const savedFlick=engFlick;
      // Only advance flick for the real player ship (skinIdx===undefined means player)
      if(skinIdx==null) engFlick=(engFlick+0.18)%(Math.PI*2);
      const fl=0.85+0.15*Math.sin(engFlick);
      ctx.save(); ctx.globalAlpha=alpha; ctx.translate(x,y); ctx.rotate(tilt);

      // Shield bubble
      if(shielded&&skinIdx==null){
        ctx.beginPath(); ctx.arc(2,0,33,0,Math.PI*2);
        ctx.strokeStyle=`rgba(0,255,160,${0.35+0.2*Math.sin(Date.now()*0.005)})`;
        ctx.lineWidth=2; ctx.shadowBlur=14; ctx.shadowColor="#00ffb3"; ctx.stroke();
      }

      const hg=28+heat*20;
      ctx.shadowBlur=hg; ctx.shadowColor=sk.shadow;

      // Fuselage
      ctx.beginPath();
      ctx.moveTo(28,0);ctx.lineTo(14,-5);ctx.lineTo(-2,-8);ctx.lineTo(-18,-10);
      ctx.lineTo(-20,0);ctx.lineTo(-18,10);ctx.lineTo(-2,8);ctx.lineTo(14,5);ctx.closePath();
      const hull=ctx.createLinearGradient(-20,-10,28,10);
      hull.addColorStop(0,sk.h1); hull.addColorStop(0.4,sk.h2); hull.addColorStop(1,sk.h3);
      ctx.fillStyle=hull; ctx.fill();

      // Ridge
      ctx.beginPath();ctx.moveTo(20,-2);ctx.lineTo(6,-6);ctx.lineTo(-14,-7);ctx.lineTo(-18,-4);ctx.lineTo(-6,-5);ctx.lineTo(10,-3);ctx.closePath();
      ctx.fillStyle="rgba(160,210,255,0.42)"; ctx.shadowBlur=0; ctx.fill();

      // Top wing
      ctx.beginPath();ctx.moveTo(6,-8);ctx.lineTo(-4,-22);ctx.lineTo(-14,-22);ctx.lineTo(-18,-10);ctx.lineTo(-2,-8);ctx.closePath();
      const wt=ctx.createLinearGradient(0,-22,0,-8); wt.addColorStop(0,sk.wing); wt.addColorStop(1,sk.h2);
      ctx.fillStyle=wt; ctx.shadowBlur=8; ctx.shadowColor=sk.shadow; ctx.fill();
      ctx.beginPath();ctx.moveTo(2,-10);ctx.lineTo(-6,-20);ctx.lineTo(-10,-20);ctx.lineTo(-4,-10);ctx.closePath();
      ctx.fillStyle=sk.wAccent; ctx.fill();

      // Bottom wing
      ctx.beginPath();ctx.moveTo(6,8);ctx.lineTo(-4,22);ctx.lineTo(-14,22);ctx.lineTo(-18,10);ctx.lineTo(-2,8);ctx.closePath();
      const wb=ctx.createLinearGradient(0,8,0,22); wb.addColorStop(0,sk.h2); wb.addColorStop(1,sk.wing);
      ctx.fillStyle=wb; ctx.fill();
      ctx.beginPath();ctx.moveTo(2,10);ctx.lineTo(-6,20);ctx.lineTo(-10,20);ctx.lineTo(-4,10);ctx.closePath();
      ctx.fillStyle=sk.wAccent; ctx.fill();

      // Cockpit
      ctx.beginPath(); ctx.ellipse(14,0,8,4.5,0,0,Math.PI*2);
      const cg=ctx.createRadialGradient(12,-1.5,0.5,14,0,8);
      cg.addColorStop(0,"rgba(255,255,255,0.95)"); cg.addColorStop(0.4,"rgba(180,240,255,0.75)"); cg.addColorStop(1,"rgba(0,180,220,0.4)");
      ctx.fillStyle=cg; ctx.shadowBlur=6; ctx.shadowColor="#aaf0ff"; ctx.fill();
      ctx.beginPath(); ctx.ellipse(13,-1.5,3.5,1.5,-0.3,0,Math.PI*2); ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.fill();

      // Nacelles
      [-6,6].forEach(ey=>{
        ctx.beginPath(); ctx.ellipse(-15,ey,5,2.5,0,0,Math.PI*2); ctx.fillStyle="#b8d8f0"; ctx.shadowBlur=0; ctx.fill();
        ctx.beginPath(); ctx.ellipse(-19,ey,2.8,2,0,0,Math.PI*2);
        ctx.fillStyle=`rgba(${sk.eR},${sk.eG},${sk.eB},${0.8*fl})`; ctx.shadowBlur=12*fl; ctx.shadowColor=sk.shadow; ctx.fill();
      });

      // Main engine
      ctx.beginPath(); ctx.ellipse(-18,0,4.5,3.5,0,0,Math.PI*2); ctx.fillStyle="#cce8ff"; ctx.shadowBlur=0; ctx.fill();
      ctx.beginPath(); ctx.ellipse(-20,0,3.2,2.4,0,0,Math.PI*2);
      ctx.fillStyle=`rgba(${sk.eR},${sk.eG},${sk.eB},${fl})`; ctx.shadowBlur=20*fl; ctx.shadowColor=sk.shadow; ctx.fill();

      if(skinIdx!=null) engFlick=savedFlick; // restore for ghost so player flicker isn't doubled
      ctx.restore();
    }

    function drawFlame(x,y,vy){
      const sk=SKINS[activeSkin]||SKINS[0];
      const tilt=Math.max(-0.28,Math.min(0.28,vy*0.045));
      const flen=pressing?24+Math.random()*10:13+Math.random()*6;
      ctx.save(); ctx.translate(x,y); ctx.rotate(tilt);
      const fg=ctx.createLinearGradient(0,0,-(flen+12),0);
      fg.addColorStop(0,`rgba(${sk.eR},${sk.eG},${sk.eB},${0.9+0.1*Math.sin(engFlick)})`);
      fg.addColorStop(0.3,"rgba(0,160,255,0.55)"); fg.addColorStop(0.7,"rgba(80,0,255,0.22)"); fg.addColorStop(1,"rgba(0,0,200,0)");
      ctx.shadowBlur=18; ctx.shadowColor=sk.shadow; ctx.fillStyle=fg;
      ctx.beginPath(); ctx.ellipse(-(flen/2)-18,0,flen/2,pressing?7:4.5,0,0,Math.PI*2); ctx.fill();
      [-6,6].forEach(ey=>{
        const nfl=10+Math.random()*5+(pressing?5:0);
        const nfg=ctx.createLinearGradient(0,0,-nfl-19,0);
        nfg.addColorStop(0,`rgba(${sk.eR},${sk.eG},${sk.eB},0.7)`); nfg.addColorStop(1,"rgba(0,100,255,0)");
        ctx.fillStyle=nfg; ctx.shadowBlur=8;
        ctx.beginPath(); ctx.ellipse(-(nfl/2)-19,ey,nfl/2,2.5,0,0,Math.PI*2); ctx.fill();
      });
      ctx.restore();
    }

    // ── Draw obstacle (zone-aware) ────────────────────────────
    function drawObs(obs){
      const zn=ZONES[activeZone]||ZONES[0];
      const hw=20,lx=obs.x-hw,rw=hw*2,botY=obs.gapY+obs.GAP;
      const gc=`rgba(0,${Math.floor(200+heat*55)},255,0.95)`;
      ctx.save();
      ctx.fillStyle="#050d1a"; ctx.fillRect(lx,0,rw,obs.gapY); ctx.fillRect(lx,botY,rw,H-botY);
      ctx.strokeStyle="rgba(0,180,255,0.05)"; ctx.lineWidth=1;
      for(let yy=16;yy<obs.gapY-4;yy+=20){ctx.beginPath();ctx.moveTo(lx+5,yy);ctx.lineTo(lx+rw-5,yy);ctx.stroke();}
      for(let yy=botY+16;yy<H-4;yy+=20){ctx.beginPath();ctx.moveTo(lx+5,yy);ctx.lineTo(lx+rw-5,yy);ctx.stroke();}
      // Zone-specific rim tint
      if(zn.obsRim){
        ctx.strokeStyle=zn.obsRim; ctx.lineWidth=3;
        ctx.strokeRect(lx-1,0,rw+2,obs.gapY); ctx.strokeRect(lx-1,botY,rw+2,H-botY);
      } else {
        ctx.strokeStyle="rgba(0,200,255,0.1)"; ctx.lineWidth=1;
        ctx.strokeRect(lx,0,rw,obs.gapY); ctx.strokeRect(lx,botY,rw,H-botY);
      }
      ctx.shadowBlur=18+heat*10; ctx.shadowColor="#00FFFF";
      ctx.strokeStyle=gc; ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(lx-1,obs.gapY);ctx.lineTo(lx+rw+1,obs.gapY);ctx.stroke();
      ctx.beginPath();ctx.moveTo(lx-1,botY);ctx.lineTo(lx+rw+1,botY);ctx.stroke();
      ctx.fillStyle=gc; ctx.shadowBlur=10;
      [[lx+5,obs.gapY],[lx+rw-5,obs.gapY],[lx+5,botY],[lx+rw-5,botY]].forEach(([cx,cy])=>{
        ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();
      });
      ctx.restore();
    }

    // ── Draw pickup ──────────────────────────────────────────
    function drawPickup(p){
      p.pulse+=0.08;
      const g=0.7+0.3*Math.sin(p.pulse);
      const col=p.type==="score"?"#00FFFF":p.type==="mult"?"#FFD700":"#00FF99";
      const lbl=p.type==="score"?"S":p.type==="mult"?"2×":"★";
      ctx.save(); ctx.translate(p.x,p.y);
      ctx.shadowBlur=16*g; ctx.shadowColor=col;
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.globalAlpha=0.55+0.3*g; ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fillStyle=col; ctx.globalAlpha=1; ctx.fill();
      ctx.fillStyle="#000"; ctx.font="bold 7px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(lbl,0,0.5);
      ctx.restore();
    }

    // ── Goal helpers ─────────────────────────────────────────
    function gProg(){
      const g=GOALS[goalIdx%GOALS.length]; if(!g)return 0;
      return Math.min(1,
        g.key==="survival"?survTime/g.target:
        g.key==="clean"   ?cleanPasses/g.target:
        g.key==="score"   ?(rawScore/10)/g.target:
        g.key==="streak"  ?streak/g.target:
        pickupsColl/g.target);
    }
    function checkGoal(){
      if(goalDone)return;
      if(gProg()>=1){
        goalDone=true; sndCheer(); rawScore+=500;
        bn("✓ "+GOALS[goalIdx%GOALS.length].desc.toUpperCase()+"  +50","#00FFFF",120);
        burst(SHIP_X,shipY,20);
        setTimeout(()=>{ goalDone=false; goalIdx++; },1900);
      }
    }

    // ── Ghost ship draw ───────────────────────────────────────
    function drawGhost(){
      if(!ghostPath||tick<=60) return;
      const gIdx=Math.floor(tick/12);
      if(gIdx>=ghostPath.length) return;
      drawShip(SHIP_X-55, ghostPath[gIdx], 0, 0.22, 0);
    }

    // ── PB pace comparison ────────────────────────────────────
    function checkPBPace(dispScore){
      if(!ghostScoreBySecond) return;
      const sec=Math.floor(survTime);
      if(sec<3||sec>=ghostScoreBySecond.length) return;
      const pbAt=ghostScoreBySecond[sec];
      if(pbAt==null) return;
      const diff=dispScore-pbAt;
      if(Math.abs(diff)>4){ pbPaceAhead=diff>0; pbPaceShow=70; }
    }

    // ── Main loop ────────────────────────────────────────────
    function loop(){
      const sx=shake>0?(Math.random()-0.5)*shake*3:0;
      const sy=shake>0?(Math.random()-0.5)*shake*3:0;
      if(shake>0) shake=Math.max(0,shake-0.5);

      ctx.save(); ctx.translate(sx,sy);
      ctx.fillStyle="#00000e"; ctx.fillRect(-20,-20,W+40,H+40);

      // Near miss flash
      if(nearFlash>0){ ctx.fillStyle=`rgba(0,255,255,${nearFlash*0.02})`; ctx.fillRect(-20,-20,W+40,H+40); nearFlash=Math.max(0,nearFlash-1); }

      // Zone-aware vignette
      const zn=ZONES[activeZone]||ZONES[0];
      const vigStr=activeZone===2
        ? `rgba(${Math.floor(30+15*Math.sin(Date.now()*0.0015))},0,0,0.72)` // VOID CORE: pulsing red
        : zn.vig;
      const vig=ctx.createRadialGradient(W/2,H/2,H*0.1,W/2,H/2,H*0.9);
      vig.addColorStop(0,"rgba(0,0,0,0)"); vig.addColorStop(1,vigStr);
      ctx.fillStyle=vig; ctx.fillRect(-20,-20,W+40,H+40);

      // Stars
      const lspd=[0.12,0.35,0.8];
      const zoneMult=zn.starMult;
      stars.forEach(s=>{
        s.tw+=0.007;
        const a=s.a*(0.78+0.22*Math.sin(s.tw));
        if(state==="playing"){
          s.x-=lspd[s.layer]*(speed/1.6)*(1+heat*0.75)*zoneMult;
          if(s.x<-2){s.x=W+2;s.y=Math.random()*H;}
        }
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r*[0.55,0.9,1.4][s.layer],0,Math.PI*2);
        ctx.fillStyle=`rgba(255,255,255,${a})`; ctx.fill();
      });

      // Zone 1+: nebula blobs
      if(activeZone>=1){
        nebulae.forEach(nb=>{
          if(state==="playing"){ nb.x-=nb.spd*(activeZone===2?1.25:1); if(nb.x<-nb.r*2){ nb.x=W+nb.r; nb.y=Math.random()*H; } }
          const col1=activeZone===2?"rgba(220,0,0,0.09)":"rgba(180,0,220,0.11)";
          const col0=activeZone===2?"rgba(220,0,0,0)":"rgba(180,0,220,0)";
          const ng=ctx.createRadialGradient(nb.x,nb.y,0,nb.x,nb.y,nb.r);
          ng.addColorStop(0,col1); ng.addColorStop(1,col0);
          ctx.fillStyle=ng; ctx.beginPath(); ctx.arc(nb.x,nb.y,nb.r,0,Math.PI*2); ctx.fill();
        });
      }

      // ── Playing ──────────────────────────────────────────
      if(state==="playing"){
        tick++; rawScore++; survTime=tick/60;
        speed=1.6+tick*0.00028;
        if(tick%1100===0&&spawnI>72) spawnI-=4;

        // Ghost recording
        if(tick%12===0&&ghostRecord.length<3600) ghostRecord.push(Math.round(shipY));
        const curSec=Math.floor(survTime);
        if(curSec!==lastGhostSecond){ lastGhostSecond=curSec; ghostScoreRecord[curSec]=Math.floor(rawScore/10); }

        const tgtHeat=Math.min(1,(speed-1.6)*1.2+streak*0.04);
        heat+=(tgtHeat-heat)*0.008;

        if(multT>0){ multT--; if(multT===0){mult=1; bn("MULTIPLIER ENDED","#888",60);} }
        if(shieldT>0){ shieldT--; if(shieldT===0){shielded=false; bn("SHIELD DOWN","#ff4444",60);} }
        if(bnT>0) bnT--;
        if(closeShow>0) closeShow--;
        if(pbPaceShow>0) pbPaceShow--;
        setHum(speed,true);

        shipVY+=pressing?THRUST:GRAVITY;
        shipVY*=DAMPING;
        shipVY=Math.max(-MAX_VY,Math.min(MAX_VY,shipVY));
        shipY+=shipVY;
        if(shipY<18){shipY=18;shipVY=Math.abs(shipVY)*0.15;}
        if(shipY>H-18){shipY=H-18;shipVY=-Math.abs(shipVY)*0.15;}

        trail.push({x:SHIP_X,y:shipY});
        if(trail.length>30) trail.shift();

        obstacles.forEach(o=>{
          if(o.drift){
            o.dOff+=o.dDir*0.28;
            if(Math.abs(o.dOff)>26) o.dDir*=-1;
            o.gapY=Math.max(50,Math.min(H-o.GAP-50,o.baseGapY+o.dOff));
          }
          o.x-=speed;
        });
        obstacles=obstacles.filter(o=>o.x>-70);
        pickups.forEach(p=>{p.x-=speed;});
        pickups=pickups.filter(p=>p.x>-20&&!p.collected);
        if(++spawnT>=spawnI){spawnObs();spawnT=0;}

        let hit=false;
        const HR=8;
        obstacles.forEach(o=>{
          const inX=SHIP_X+HR>o.x-20&&SHIP_X-HR<o.x+20;
          if(inX){
            if(shipY-HR<o.gapY||shipY+HR>o.gapY+o.GAP){
              if(!shielded) hit=true;
              else{ shielded=false; shieldT=0; bn("SHIELD ABSORBED IT!","#00FF99",90); }
            } else {
              const dTop=shipY-o.gapY, dBot=(o.gapY+o.GAP)-shipY;
              const minD=Math.min(dTop,dBot)-HR;
              if(minD<15&&!o.nearMissed){
                o.nearMissed=true; closestPx=Math.min(closestPx,minD);
                nearFlash=14; shake=5; closeShow=80; sndNear(); bn("⚡ CLOSE CALL!","#FFAA00",75);
              }
            }
          }
          if(!o.scored&&o.x+20<SHIP_X-HR){
            o.scored=true; streak++; cleanPasses++;
            bestStrRun=Math.max(bestStrRun,streak); sndGate(streak);
            if(streak===3)  bn("3× STREAK!","#00FFFF",65);
            if(streak===5)  {bn("5× STREAK! 🔥","#FFD700",90);burst(SHIP_X,shipY,12);sndCheer();}
            if(streak===10) {bn("10× STREAK!! 🔥🔥","#FF6600",120);burst(SHIP_X,shipY,22);sndCheer();setTimeout(sndCheer,250);}
          }
        });

        pickups.forEach(p=>{
          if(p.collected)return;
          const dx=SHIP_X-p.x, dy=shipY-p.y;
          if(Math.sqrt(dx*dx+dy*dy)<18){
            p.collected=true; pickupsColl++; sndPickup(); burst(p.x,p.y,12);
            if(p.type==="score")  {rawScore+=300; bn("+30 SCORE SURGE!","#00FFFF",80);}
            if(p.type==="mult")   {mult=2; multT=480; bn("2× MULTIPLIER  8 SECS!","#FFD700",90);}
            if(p.type==="shield") {shielded=true;shieldT=600;bn("SHIELD ACTIVE!","#00FF99",90);}
          }
        });

        checkGoal();

        if(!dDone){
          const dc=getDaily();
          const done=(dc.key==="survival"&&survTime>=dc.target)||(dc.key==="clean"&&cleanPasses>=dc.target)||
                     (dc.key==="score"&&rawScore/10>=dc.target)||(dc.key==="streak"&&bestStrRun>=dc.target)||
                     (dc.key==="pickups"&&pickupsColl>=dc.target);
          if(done){dDone=true;rawScore+=1000;sndCheer();setTimeout(sndCheer,300);bn("★ DAILY CHALLENGE COMPLETE! +100 ★","#FFD700",220);}
        }

        const dispScore=Math.floor(rawScore*mult/10);
        if(tick%180===0) checkPBPace(dispScore);

        if(hit){
          state="dead"; deathT=0;
          const nb=dispScore>bScore, delta=nb?0:bScore-dispScore;
          updateDiff(dispScore);
          bScore=Math.max(bScore,dispScore);
          bStreak=Math.max(bStreak,bestStrRun); bSurvival=Math.max(bSurvival,survTime); bClean=Math.max(bClean,cleanPasses);
          // Save ghost on new best
          if(nb){
            ghostPath=ghostRecord.slice();
            ghostScoreBySecond=ghostScoreRecord.slice();
          }
          checkUnlocks(dispScore, bestStrRun, survTime);
          persist();
          setHum(speed,false); explode(SHIP_X,shipY); sndDie(); shake=14;
          const tip=survTime<8?"TIP: HOLD LONGER — LET THE SHIP FLOAT":
                    cleanPasses<3?"TIP: AIM FOR THE CENTER OF THE GAP":
                    streak>4?"GREAT STREAK — AIM HIGHER NEXT RUN":
                    !nb&&delta<=5?"SO CLOSE — ONE MORE GO":
                    "KEEP THE STREAK ALIVE";
          setUi(u=>({...u,state:"dead",score:dispScore,best:bScore,
            ds:dispScore,dStreak:bestStrRun,dSurvival:Math.floor(survTime),dClean:cleanPasses,
            newBest:nb,delta,dTip:tip,pbStreak:bStreak,pbSurvival:Math.floor(bSurvival),
            dailyDone:dDone,deathOverlay:false,
          }));
          // Delay overlay so explosion plays first
          setTimeout(()=>setUi(u=>u.state==="dead"?{...u,deathOverlay:true}:u), 340);
        } else {
          if(++uiThrottle%8===0){
            setUi(u=>({...u,score:dispScore,streak,multiplier:mult,shielded,state:"playing",
              tier:getTier(dispScore).name,nextTier:getNextTier(dispScore)?.name||"",
              nextMin:getNextTier(dispScore)?.min||0,best:bScore,dailyDone:dDone,
            }));
          }
        }
      }
      if(state==="dead") deathT++;

      // Trail (palette-aware)
      trail.forEach((pt,i)=>{
        const t=i/trail.length;
        const trailFn=TRAIL_DEFS[activeTrail]?.fn||TRAIL_DEFS[0].fn;
        ctx.beginPath(); ctx.arc(pt.x-i*0.2,pt.y,0.5+t*2.5,0,Math.PI*2);
        ctx.fillStyle=trailFn(t,i,heat); ctx.fill();
      });

      // Ghost (behind player, visual only)
      if(state==="playing") drawGhost();

      if(state==="playing") drawFlame(SHIP_X,shipY,shipVY);
      obstacles.forEach(drawObs);
      pickups.forEach(drawPickup);

      // Particles
      particles=particles.filter(p=>p.life>0);
      particles.forEach(p=>{
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.07; p.life-=p.decay;
        ctx.save();
        const pc=p.hue==="cyan"?`rgba(0,220,255,${p.life})`:p.hue==="orange"?`rgba(255,160,40,${p.life*0.85})`:`rgba(255,255,255,${p.life*0.75})`;
        ctx.shadowBlur=8; ctx.shadowColor=p.hue==="cyan"?"#00FFFF":p.hue==="orange"?"#ff8800":"#fff";
        ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.1,p.size*p.life),0,Math.PI*2); ctx.fillStyle=pc; ctx.fill(); ctx.restore();
      });

      // Ship
      if(state!=="dead") drawShip(SHIP_X,shipY,shipVY,1);
      else if(deathT<34&&Math.floor(deathT/5)%2===0) drawShip(SHIP_X,shipY,0,0.5);

      // ── Canvas HUD overlays ─────────────────────────────
      ctx.textAlign="center";

      if(state==="playing"){
        // Banner
        if(bnT>0){
          const ba=Math.min(1,bnT/14)*Math.min(1,(bnT/50)*2.2);
          ctx.save(); ctx.globalAlpha=ba;
          ctx.font="700 13px 'Orbitron',sans-serif"; ctx.shadowBlur=14; ctx.shadowColor=bnCol; ctx.fillStyle=bnCol;
          ctx.fillText(bnMsg,W/2,52); ctx.restore();
        }
        // Close call
        if(closeShow>0){
          const ca=Math.min(1,closeShow/12)*Math.min(1,(closeShow/40)*2.5);
          ctx.save(); ctx.globalAlpha=ca;
          ctx.font="900 18px 'Orbitron',sans-serif"; ctx.shadowBlur=22; ctx.shadowColor="#FFAA00"; ctx.fillStyle="#FFAA00";
          ctx.fillText("⚡ CLOSE CALL ⚡",W/2,H/2-60); ctx.restore();
        }
        // PB pace indicator
        if(pbPaceShow>0){
          const pa=Math.min(1,pbPaceShow/14)*0.88;
          ctx.save(); ctx.globalAlpha=pa;
          ctx.font="400 8px 'Orbitron',sans-serif"; ctx.textAlign="right";
          ctx.fillStyle=pbPaceAhead?"#44FF88":"#FFAA44";
          ctx.shadowBlur=8; ctx.shadowColor=pbPaceAhead?"#44FF88":"#FFAA44";
          ctx.fillText(pbPaceAhead?"↑ AHEAD OF PB PACE":"↓ BEHIND PB PACE",W-14,18); ctx.restore();
        }
        // Goal progress bar
        const gObj=GOALS[goalIdx%GOALS.length];
        if(gObj){
          const prog=gProg(), bw=175, bh=4, bx=W-bw-14, by=H-20;
          ctx.save();
          ctx.fillStyle="rgba(255,255,255,0.07)"; ctx.fillRect(bx,by,bw,bh);
          ctx.fillStyle=goalDone?"#FFD700":"#00FFFF"; ctx.shadowBlur=5; ctx.shadowColor=goalDone?"#FFD700":"#00FFFF";
          ctx.fillRect(bx,by,bw*prog,bh);
          ctx.font="400 7px 'Orbitron',sans-serif"; ctx.textAlign="right";
          ctx.fillStyle="rgba(255,255,255,0.26)"; ctx.shadowBlur=0;
          ctx.fillText(gObj.desc,W-14,H-26); ctx.restore();
        }
      }

      // ── IDLE SCREEN ────────────────────────────────────
      if(state==="idle"){
        swatchHitboxes=[];
        ctx.save(); ctx.textAlign="center";
        ctx.font="900 54px 'Orbitron',sans-serif"; ctx.shadowBlur=42; ctx.shadowColor="#00FFFF"; ctx.fillStyle="#FFFFFF";
        ctx.fillText("VOID RUN",W/2,H/2-46);
        const lr=ctx.createLinearGradient(W/2-150,0,W/2+150,0);
        lr.addColorStop(0,"rgba(0,255,255,0)"); lr.addColorStop(0.5,"rgba(0,255,255,0.35)"); lr.addColorStop(1,"rgba(0,255,255,0)");
        ctx.strokeStyle=lr; ctx.lineWidth=1; ctx.shadowBlur=0;
        ctx.beginPath(); ctx.moveTo(W/2-150,H/2-16); ctx.lineTo(W/2+150,H/2-16); ctx.stroke();

        // Tier / flight-assist badge
        ctx.font="400 8px 'Orbitron',sans-serif"; ctx.shadowBlur=0;
        if(!graduatedOnboarding){
          ctx.fillStyle="rgba(0,255,160,0.65)"; ctx.shadowBlur=8; ctx.shadowColor="#00FF99";
          ctx.fillText("✦ FLIGHT ASSIST ACTIVE",W/2,H/2);
        } else if(bScore>0){
          ctx.fillStyle="rgba(0,230,255,0.35)";
          ctx.fillText(getTier(bScore).name,W/2,H/2);
        }
        ctx.shadowBlur=0;

        // Controls hint
        ctx.font="400 9px 'Orbitron',sans-serif"; ctx.fillStyle="rgba(0,230,255,0.4)";
        ctx.fillText("HOLD SPACE · CLICK & HOLD · TAP",W/2,H/2+16);
        if(bScore>0){
          ctx.font="400 9px 'Orbitron',sans-serif"; ctx.fillStyle="rgba(255,255,255,0.22)";
          ctx.fillText(`BEST: ${String(bScore).padStart(6,"0")}`,W/2,H/2+34);
        }

        // ── Skin swatches ─────────────────────────────
        const skinY=H/2+62;
        ctx.font="400 6px 'Orbitron',sans-serif"; ctx.fillStyle="rgba(255,255,255,0.18)";
        ctx.fillText("SHIP",W/2,skinY-14);
        SKINS.forEach((sk,i)=>{
          const cx=W/2-(SKINS.length-1)*20+i*40;
          const unlocked=unlockedSkins.includes(i);
          const active=activeSkin===i;
          ctx.save();
          ctx.globalAlpha=unlocked?1:0.28;
          ctx.beginPath(); ctx.arc(cx,skinY,14,0,Math.PI*2);
          ctx.fillStyle=sk.wing;
          if(active){ ctx.shadowBlur=18; ctx.shadowColor=sk.shadow; }
          ctx.fill();
          ctx.beginPath(); ctx.arc(cx,skinY,14,0,Math.PI*2);
          ctx.strokeStyle=active?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.18)";
          ctx.lineWidth=active?2:1; ctx.shadowBlur=0; ctx.stroke();
          if(!unlocked){
            ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fill();
            ctx.font="9px monospace"; ctx.globalAlpha=0.55;
            ctx.fillStyle="#fff"; ctx.fillText("🔒",cx,skinY+3.5);
          }
          ctx.restore();
          swatchHitboxes.push({x:cx,y:skinY,r:16,action:()=>{
            if(!unlocked) return;
            activeSkin=i;
            persist();
          }});
        });

        // ── Trail swatches ─────────────────────────────
        const trailY=H/2+95;
        ctx.font="400 6px 'Orbitron',sans-serif"; ctx.fillStyle="rgba(255,255,255,0.18)"; ctx.shadowBlur=0;
        ctx.fillText("TRAIL",W/2,trailY-12);
        const tColors=["#00FFFF","#FFB300","#BB44FF"];
        TRAIL_DEFS.forEach((tr,i)=>{
          const cx=W/2-(TRAIL_DEFS.length-1)*24+i*48;
          const unlocked=unlockedTrails.includes(i);
          const active=activeTrail===i;
          ctx.save();
          ctx.globalAlpha=unlocked?1:0.28;
          ctx.beginPath(); ctx.arc(cx,trailY,10,0,Math.PI*2);
          ctx.fillStyle=tColors[i];
          if(active){ ctx.shadowBlur=14; ctx.shadowColor=tColors[i]; }
          ctx.fill();
          ctx.beginPath(); ctx.arc(cx,trailY,10,0,Math.PI*2);
          ctx.strokeStyle=active?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.18)";
          ctx.lineWidth=active?2:1; ctx.shadowBlur=0; ctx.stroke();
          if(!unlocked){
            ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fill();
          }
          ctx.restore();
          swatchHitboxes.push({x:cx,y:trailY,r:14,action:()=>{
            if(!unlocked) return;
            activeTrail=i;
            persist();
          }});
        });

        // ── Zone selector ──────────────────────────────
        const maxUnlockedZone=decentRunCount>=10?2:decentRunCount>=4?1:0;
        if(maxUnlockedZone>=1){
          const zoneY=H/2+122;
          const znLabel=`ZONE: ${ZONES[activeZone].name} ▶`;
          ctx.font="400 7px 'Orbitron',sans-serif"; ctx.fillStyle="rgba(255,255,255,0.28)"; ctx.shadowBlur=0;
          ctx.fillText(znLabel,W/2,zoneY);
          swatchHitboxes.push({x:W/2,y:zoneY,r:55,action:()=>{
            activeZone=(activeZone+1)%(maxUnlockedZone+1);
            persist();
          }});
        }

        const pulse=0.45+0.3*Math.sin(Date.now()*0.0022);
        const pressY=H/2+(maxUnlockedZone>=1?142:122);
        ctx.font="400 9px 'Orbitron',sans-serif"; ctx.fillStyle=`rgba(255,255,255,${pulse})`;
        ctx.fillText("— PRESS TO BEGIN —",W/2,pressY); ctx.restore();
      }

      ctx.restore();
      raf=requestAnimationFrame(loop);
    }

    raf=requestAnimationFrame(loop);

    // ── Input ────────────────────────────────────────────────
    function tryStart(){
      if(state==="idle"||(state==="dead"&&deathT>16)){
        initAudio(); reset(); state="playing";
        setUi(u=>({...u,state:"playing",score:0,streak:0,multiplier:1,shielded:false,deathOverlay:false}));
      }
    }

    const kd=(e)=>{if(["Space","ArrowUp","KeyW"].includes(e.code)){e.preventDefault();pressing=true;tryStart();}};
    const ku=(e)=>{if(["Space","ArrowUp","KeyW"].includes(e.code))pressing=false;};

    const pd=(e)=>{
      e.preventDefault();
      // Check swatch hitboxes on idle screen first
      if(state==="idle"){
        const rect=canvas.getBoundingClientRect();
        const px=(e.clientX-rect.left)*(W/rect.width);
        const py=(e.clientY-rect.top)*(H/rect.height);
        for(const h of swatchHitboxes){
          const dx=px-h.x, dy=py-h.y;
          if(Math.sqrt(dx*dx+dy*dy)<=h.r){ h.action(); return; }
        }
      }
      pressing=true; tryStart();
    };
    const pu=()=>{pressing=false;};

    window.addEventListener("keydown",kd); window.addEventListener("keyup",ku);
    canvas.addEventListener("pointerdown",pd); window.addEventListener("pointerup",pu);

    return()=>{
      cancelAnimationFrame(raf);
      try{engOsc?.stop();}catch(e){}
      try{AC?.close();}catch(e){}
      window.removeEventListener("keydown",kd); window.removeEventListener("keyup",ku);
      canvas.removeEventListener("pointerdown",pd); window.removeEventListener("pointerup",pu);
    };
  },[]);

  const {state,score,best,streak,multiplier,shielded,tier,nextTier,nextMin,dailyDone,
         ds,dStreak,dSurvival,dClean,dTip,newBest,delta,pbStreak,pbSurvival,deathOverlay}=ui;

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      minHeight:"100vh",background:"#00000e",fontFamily:"'Orbitron',sans-serif",
      userSelect:"none",WebkitUserSelect:"none"}}>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet"/>

      {/* Top HUD */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:`${W}px`,paddingBottom:"8px"}}>
        <div style={{fontSize:"9px",letterSpacing:"2px",color:"rgba(255,255,255,0.28)"}}>
          SCORE&nbsp;
          <span style={{color:multiplier>1?"#FFD700":"#00FFFF",fontWeight:700,fontSize:"17px"}}>
            {String(score||0).padStart(6,"0")}
          </span>
          {multiplier>1&&<span style={{fontSize:"9px",color:"#FFD700",marginLeft:5}}>×{multiplier}</span>}
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {streak>0&&state==="playing"&&<div style={{fontSize:"8px",color:"#00FFFF",letterSpacing:"2px",textShadow:"0 0 8px #00FFFF"}}>{streak}× STREAK</div>}
          {shielded&&<div style={{fontSize:"8px",color:"#00FF99"}}>🛡</div>}
          {tier&&state==="playing"&&<div style={{fontSize:"7px",color:"rgba(255,255,255,0.22)",letterSpacing:"3px"}}>{tier}</div>}
        </div>
        <div style={{fontSize:"9px",letterSpacing:"2px",color:"rgba(255,255,255,0.18)"}}>
          BEST&nbsp;<span style={{color:"rgba(255,255,255,0.35)",fontWeight:700,fontSize:"14px"}}>{String(best||0).padStart(6,"0")}</span>
        </div>
      </div>

      {/* Canvas */}
      <div style={{position:"relative"}}>
        <canvas ref={canvasRef} width={W} height={H}
          style={{display:"block",cursor:"pointer",border:"1px solid rgba(0,255,255,0.08)",boxShadow:"0 0 80px rgba(0,255,255,0.04)"}}/>

        {/* Death screen overlay */}
        {state==="dead"&&deathOverlay&&(
          <div style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            background:"rgba(0,0,12,0.84)",pointerEvents:"none"}}>

            <div style={{fontSize:"34px",fontWeight:900,color:"#fff",letterSpacing:"3px",textShadow:"0 0 28px #FF1833",marginBottom:6}}>
              SIGNAL LOST
            </div>

            {newBest
              ? <div style={{fontSize:"10px",color:"#FFD700",letterSpacing:"4px",textShadow:"0 0 14px #FFD700",marginBottom:5}}>✦ NEW PERSONAL BEST ✦</div>
              : delta>0&&<div style={{fontSize:"9px",color:"rgba(255,200,100,0.55)",letterSpacing:"2px",marginBottom:5}}>{delta} FROM YOUR BEST</div>
            }

            <div style={{fontSize:"26px",fontWeight:700,color:"#00FFFF",textShadow:"0 0 18px #00FFFF",marginBottom:14}}>
              {String(ds||0).padStart(6,"0")}
            </div>

            {/* Records grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"4px 14px",
              marginBottom:12,padding:"10px 20px",border:"1px solid rgba(0,255,255,0.1)",background:"rgba(0,0,0,0.35)"}}>
              {[
                ["STREAK",   `${dStreak||0}×`,          `PB ${pbStreak||0}×`],
                ["SURVIVED", `${dSurvival||0}s`,         `PB ${pbSurvival||0}s`],
                ["CLEAN",    `${dClean||0} gates`,       ""],
                ["RANK",     getTier(ds||0).name,        nextTier?`→ ${nextTier} @ ${nextMin}`:""],
              ].map(([lbl,val,sub])=>(
                <div key={lbl} style={{textAlign:"center"}}>
                  <div style={{fontSize:"6px",color:"rgba(255,255,255,0.22)",letterSpacing:"2px",marginBottom:2}}>{lbl}</div>
                  <div style={{fontSize:"12px",color:"#00FFFF",fontWeight:700}}>{val}</div>
                  {sub&&<div style={{fontSize:"6px",color:"rgba(255,255,255,0.2)"}}>{sub}</div>}
                </div>
              ))}
            </div>

            {dTip&&<div style={{fontSize:"8px",color:"rgba(255,200,60,0.72)",letterSpacing:"2px",marginBottom:10,maxWidth:300,textAlign:"center",lineHeight:1.7}}>{dTip}</div>}
            {dailyDone&&<div style={{fontSize:"8px",color:"#FFD700",letterSpacing:"3px",marginBottom:8}}>★ DAILY CHALLENGE COMPLETE</div>}

            <div style={{fontSize:"8px",color:"rgba(255,255,255,0.28)",letterSpacing:"3px",animation:"pulse 1.2s ease-in-out infinite"}}>
              PRESS SPACE OR TAP TO RETRY
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{display:"flex",justifyContent:"space-between",width:`${W}px`,marginTop:9,alignItems:"center"}}>
        <div style={{fontSize:"7px",letterSpacing:"3px",color:"rgba(255,255,255,0.07)"}}>
          HOLD TO THRUST · RELEASE TO FALL
        </div>
        <div style={{fontSize:"7px",letterSpacing:"2px",color:dailyDone?"#FFD700":"rgba(255,255,255,0.13)"}}>
          {dailyDone?"★ DAILY DONE":getDaily().desc}
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:0.22}50%{opacity:0.85}}`}</style>
    </div>
  );
}
