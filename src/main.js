// 三國武將倖存者（原型）：單一武將＋少量部隊（弓手、騎兵、招降來的副將），對抗海量黃巾軍。
// 色塊美術；之後換成像素小單位和 AI 立繪。
import { VIEW, HERO, SQUAD, DEPUTY, MUSOU, ENEMY, MAX_ENEMIES, WAVES, ELITE, STAGE, xpNeed } from './config.js';
import { drawCards as dealCards } from './upgrades.js';

const W = VIEW.w, H = VIEW.h;
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const params = new URLSearchParams(location.search), DEBUG = params.has('debug');
const FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
let scale = 1;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  scale = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = `${W * scale}px`; cv.style.height = `${H * scale}px`;
  cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
}
addEventListener('resize', resize); resize();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// ───────── 輸入：鍵盤 WASD／方向鍵、觸控搖桿（左半邊任意處拖曳）、武將技（空白鍵／右下按鈕） ─────────
const keys = new Set(), input = { mx: 0, my: 0, taps: [], skill: false };
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === ' ') { input.skill = true; e.preventDefault(); } if (/^[1-3]$/.test(e.key)) input.taps.push({ key: +e.key }); if (e.key === 'Enter') input.taps.push({ enter: true }); });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const toLogic = (t) => { const r = cv.getBoundingClientRect(); return { x: (t.clientX - r.left) / r.width * W, y: (t.clientY - r.top) / r.height * H }; };
const SKILL_BTN = { x: W - 78, y: H - 78, r: 46 };
cv.addEventListener('pointerdown', (e) => {
  const p = toLogic(e);
  if (G.mode === 'play' && Math.hypot(p.x - SKILL_BTN.x, p.y - SKILL_BTN.y) < SKILL_BTN.r) { input.skill = true; return; }
  if (G.mode === 'play' && p.x < W * 0.6 && stick.id === null) { stick.id = e.pointerId; stick.ox = p.x; stick.oy = p.y; stick.x = p.x; stick.y = p.y; cv.setPointerCapture(e.pointerId); return; }
  input.taps.push(p);
});
cv.addEventListener('pointermove', (e) => { if (e.pointerId !== stick.id) return; const p = toLogic(e); stick.x = p.x; stick.y = p.y; });
const endStick = (e) => { if (e.pointerId === stick.id) stick.id = null; };
cv.addEventListener('pointerup', endStick); cv.addEventListener('pointercancel', endStick);
function readMove() {
  let x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  let y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (stick.id !== null) { const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy); if (d > 6) { x = dx / Math.max(d, 50); y = dy / Math.max(d, 50); } }
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  input.mx = x; input.my = y;
}

// ───────── 遊戲狀態 ─────────
let G;
function newGame() {
  G = {
    mode: 'title', t: 0, kills: 0, lv: 1, xp: 0, musou: 0, cards: [], taken: {}, shake: 0, cutin: 0, spawnAcc: 0,
    hero: { x: 0, y: 0, r: HERO.r, hp: HERO.hp, maxHp: HERO.hp, speed: HERO.speed, face: 0, cd: 0.4, hurtT: 0, regen: HERO.regen, pickup: HERO.pickup,
      sweepDmg: HERO.sweep.dmg, sweepRange: HERO.sweep.range, sweepArc: HERO.sweep.arc, sweepCd: HERO.sweep.cd, backSweep: false, musouGain: 1 },
    squad: [], squadMax: { archer: SQUAD.archer.start, cavalry: SQUAD.cavalry.start }, respawnT: { archer: [], cavalry: [] },
    mods: { arrows: 1, arrowDmg: 1, burn: false, cavDmg: 1, cavKnock: 0, squadRegen: 0, respawn: 1 },
    deputy: null, elite: null, eliteSpawned: false, recruitAsk: null,
    enemies: [], arrows: [], gems: [], fx: [], texts: [],
  };
  for (const k of ['archer', 'cavalry']) for (let i = 0; i < G.squadMax[k]; i++) addSquad(k);
}
function addSquad(kind) {
  const n = G.squad.filter((u) => u.kind === kind).length, cfg = SQUAD[kind];
  G.squad.push({ kind, slot: n, x: G.hero.x + rand(-20, 20), y: G.hero.y + rand(-20, 20), r: cfg.r, hp: cfg.hp, maxHp: cfg.hp, cd: rand(0, cfg.cd), state: 'follow', t: 0, vx: 0, vy: 0, hit: null });
}
// 陣形：弓手在主將身後一排、騎兵在左右兩翼（依主將面向轉）
function slotPos(u) {
  const h = G.hero, f = h.face, bx = Math.cos(f), by = Math.sin(f), px = -by, py = bx;
  if (u.kind === 'archer') { const n = G.squadMax.archer, off = (u.slot - (n - 1) / 2) * 22; return { x: h.x - bx * 42 + px * off, y: h.y - by * 42 + py * off }; }
  const side = u.slot % 2 ? 1 : -1, row = Math.floor(u.slot / 2);
  return { x: h.x + px * side * (40 + row * 18) - bx * (8 + row * 16), y: h.y + py * side * (40 + row * 18) - by * (8 + row * 16) };
}

// ───────── 空間格子：海量敵人的碰撞、範圍攻擊查詢 ─────────
const CELL = 40, grid = new Map();
const gkey = (cx, cy) => cx * 73856093 ^ cy * 19349663;
function buildGrid() {
  grid.clear();
  for (const e of G.enemies) { const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL)); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(e); }
}
function query(x, y, r, out = []) {
  out.length = 0;
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const c = grid.get(gkey(cx, cy)); if (c) for (const e of c) out.push(e); }
  return out;
}
const QBUF = [];
function nearestEnemy(x, y, range) {
  let best = null, bd = range * range;
  for (const e of query(x, y, range, QBUF)) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd && !e.dead) { bd = d; best = e; } }
  if (G.elite && !G.elite.dead) { const d = (G.elite.x - x) ** 2 + (G.elite.y - y) ** 2; if (d < bd) best = G.elite; }
  return best;
}

// ───────── 傷害、擊殺、經驗 ─────────
function damage(e, dmg, kx = 0, ky = 0, color = '#FFF') {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.08;
  if (e !== G.elite) { e.kx += kx; e.ky += ky; } else { e.kx += kx * 0.15; e.ky += ky * 0.15; }
  if (G.texts.length < 120) G.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.r, t: 0, s: `${Math.round(dmg)}`, c: color });
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  e.dead = true; G.kills++;
  G.musou = Math.min(MUSOU.need, G.musou + (e === G.elite ? 40 : 1) * G.hero.musouGain);
  if (e === G.elite) { eliteDown(); return; }
  G.gems.push({ x: e.x, y: e.y, v: e.xp });
}
function hurtFriend(u, dmg) {
  if (u.hurtT > 0 || u.dead) return;
  u.hp -= dmg; u.hurtT = u === G.hero ? HERO.invuln : 0.35;
  if (u === G.hero) G.shake = Math.max(G.shake, 0.15);
  if (u.hp <= 0) {
    if (u === G.hero) { G.mode = 'over'; return; }
    u.dead = true;
    if (u === G.deputy) { G.deputy.downT = 15; return; }
    G.squad.splice(G.squad.indexOf(u), 1); G.respawnT[u.kind].push(SQUAD.respawn * G.mods.respawn);
  }
}

// ───────── 出兵 ─────────
function waveAt(t) { let w = WAVES[0]; for (const x of WAVES) if (t >= x[0]) w = x; return w; }
function spawnEnemy(kind) {
  const cfg = ENEMY[kind], a = rand(0, Math.PI * 2), d = Math.hypot(W, H) / 2 + 40;
  G.enemies.push({ kind, x: G.hero.x + Math.cos(a) * d, y: G.hero.y + Math.sin(a) * d, r: cfg.r, hp: cfg.hp, maxHp: cfg.hp, speed: cfg.speed * rand(0.85, 1.15),
    dmg: cfg.dmg, xp: cfg.xp, color: cfg.color, kx: 0, ky: 0, flash: 0, burn: 0, dead: false });
}
function spawnElite() {
  const a = rand(0, Math.PI * 2);
  G.elite = { kind: 'elite', x: G.hero.x + Math.cos(a) * 420, y: G.hero.y + Math.sin(a) * 300, r: ELITE.r, hp: ELITE.hp, maxHp: ELITE.hp, speed: ELITE.speed, dmg: ELITE.dmg,
    kx: 0, ky: 0, flash: 0, burn: 0, dead: false, slamCd: ELITE.slam.cd, warn: 0 };
  G.eliteSpawned = true; banner('黃巾猛將「周倉」出現！擊敗他可以招降');
}
function eliteDown() {
  const e = G.elite;
  G.fx.push({ kind: 'ring', x: e.x, y: e.y, t: 0, dur: 0.6, r: 120, c: '255,220,120' });
  G.recruitAsk = { name: ELITE.name }; G.mode = 'recruit';
}
function recruit(yes) {
  if (yes) {
    const d = DEPUTY.zhoucang;
    G.deputy = { kind: 'deputy', name: d.name, x: G.elite.x, y: G.elite.y, r: d.r, hp: d.hp, maxHp: d.hp, speed: d.speed, cd: 2, spinT: 0, tick: 0, hurtT: 0, dead: false };
    banner('周倉成為你的副將！');
  } else { for (let i = 0; i < 6; i++) G.gems.push({ x: G.elite.x + rand(-30, 30), y: G.elite.y + rand(-30, 30), v: 5 }); }
  G.elite = null; G.recruitAsk = null; G.mode = 'play';
}
function banner(s) { G.fx.push({ kind: 'banner', s, t: 0, dur: 2.6 }); }

// ───────── 每幀更新 ─────────
function update(dt) {
  if (G.mode === 'title') { if (input.taps.length) { newGame(); G.mode = 'play'; } return; }
  if (G.mode === 'over' || G.mode === 'win') { if (input.taps.length) { newGame(); G.mode = 'play'; } return; }
  if (G.mode === 'levelup') { pickCard(); return; }
  if (G.mode === 'recruit') { pickRecruit(); return; }
  if (G.mode === 'cutin') { G.cutin -= dt; if (G.cutin <= 0) { G.mode = 'play'; musouBlast(); } return; }

  G.t += dt;
  if (G.t >= STAGE.duration) { G.mode = 'win'; return; }
  readMove();
  const h = G.hero;
  // 主將移動、面向（移動方向；站著不動時面向最近的敵人）
  if (input.mx || input.my) { h.x += input.mx * h.speed * dt; h.y += input.my * h.speed * dt; h.face = Math.atan2(input.my, input.mx); }
  else { const n = nearestEnemy(h.x, h.y, 200); if (n) h.face = Math.atan2(n.y - h.y, n.x - h.x); }
  h.hurtT = Math.max(0, h.hurtT - dt); h.hp = Math.min(h.maxHp, h.hp + h.regen * dt);
  // 武將技
  if (input.skill && G.musou >= MUSOU.need) { G.musou = 0; G.mode = 'cutin'; G.cutin = MUSOU.cutin; input.skill = false; return; }
  input.skill = false;

  // 出兵
  const wv = waveAt(G.t);
  G.spawnAcc += wv[1] * dt;
  while (G.spawnAcc >= 1) {
    G.spawnAcc--;
    if (G.enemies.length >= MAX_ENEMIES) break;
    let r = Math.random(), kind = 'footman';
    for (const [k, p] of Object.entries(wv[2])) { if ((r -= p) <= 0) { kind = k; break; } }
    spawnEnemy(kind);
  }
  if (!G.eliteSpawned && G.t >= ELITE.at) spawnElite();

  buildGrid();
  heroAttack(dt);
  updateSquad(dt);
  updateDeputy(dt);
  updateEnemies(dt);
  updateElite(dt);
  updateArrows(dt);
  updateGems(dt);
  for (const k of ['archer', 'cavalry']) {                     // 陣亡補員；升級加的名額也從這裡補上
    const tq = G.respawnT[k]; for (let i = tq.length - 1; i >= 0; i--) if ((tq[i] -= dt) <= 0) { tq.splice(i, 1); addSquad(k); }
    const have = G.squad.filter((u) => u.kind === k).length + tq.length; for (let i = have; i < G.squadMax[k]; i++) addSquad(k);
  }
  for (const f of G.fx) f.t += dt; G.fx = G.fx.filter((f) => f.t < f.dur);
  for (const s of G.texts) s.t += dt; G.texts = G.texts.filter((s) => s.t < 0.6);
  G.shake = Math.max(0, G.shake - dt);
  G.enemies = G.enemies.filter((e) => !e.dead);
}

function heroAttack(dt) {
  const h = G.hero;
  h.cd -= dt;
  if (h.cd > 0) return;
  h.cd = h.sweepCd;
  sweep(h.x, h.y, h.face, h.sweepRange, h.sweepArc, h.sweepDmg);
  if (h.backSweep) setTimeout(() => G.mode === 'play' && sweep(h.x, h.y, h.face + Math.PI, h.sweepRange * 0.85, h.sweepArc, h.sweepDmg * 0.7), 160);
}
function sweep(x, y, face, range, arcDeg, dmg) {
  const half = arcDeg * Math.PI / 360;
  G.fx.push({ kind: 'sweep', x, y, face, range, half, t: 0, dur: 0.22 });
  const hitOne = (e) => {
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
    if (d > range + e.r) return;
    let da = Math.atan2(dy, dx) - face; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > half && d > e.r + 6) return;
    damage(e, dmg, dx / (d || 1) * HERO.sweep.knock, dy / (d || 1) * HERO.sweep.knock, '#FFE6A0');
  };
  for (const e of query(x, y, range + 20, QBUF).slice()) hitOne(e);
  if (G.elite && !G.elite.dead) hitOne(G.elite);
}

function updateSquad(dt) {
  for (const u of G.squad.slice()) {
    u.hurtT = Math.max(0, (u.hurtT || 0) - dt); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * G.mods.squadRegen * dt);
    const cfg = SQUAD[u.kind]; u.cd -= dt;
    if (u.kind === 'cavalry' && u.state === 'dash') {             // 騎兵衝鋒：直線穿刺，撞到的都受傷
      u.t -= dt; u.x += u.vx * dt; u.y += u.vy * dt;
      for (const e of query(u.x, u.y, u.r + 14, QBUF).slice()) if (!u.hit.has(e) && dist2(e, u) < (e.r + u.r + 4) ** 2) { u.hit.add(e); damage(e, cfg.dmg * G.mods.cavDmg, u.vx * 0.25 + Math.sign(u.vx) * G.mods.cavKnock * 0.3, u.vy * 0.25 + Math.sign(u.vy) * G.mods.cavKnock * 0.3, '#A8F0FF'); }
      if (G.elite && !G.elite.dead && !u.hit.has(G.elite) && dist2(G.elite, u) < (G.elite.r + u.r) ** 2) { u.hit.add(G.elite); damage(G.elite, cfg.dmg * G.mods.cavDmg, 0, 0, '#A8F0FF'); }
      if (u.t <= 0) u.state = 'follow';
      continue;
    }
    const p = slotPos(u), dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
    if (d > 3) { const sp = Math.min(d / dt, cfg.speed * (d > 120 ? 1.8 : 1)); u.x += dx / d * sp * dt; u.y += dy / d * sp * dt; }
    if (u.cd <= 0) {
      const tgt = nearestEnemy(u.x, u.y, cfg.range);
      if (!tgt) continue;
      u.cd = cfg.cd;
      const ax = tgt.x - u.x, ay = tgt.y - u.y, ad = Math.hypot(ax, ay) || 1;
      if (u.kind === 'archer') {
        for (let i = 0; i < G.mods.arrows; i++) {
          const a = Math.atan2(ay, ax) + (i - (G.mods.arrows - 1) / 2) * 0.14;
          G.arrows.push({ x: u.x, y: u.y, vx: Math.cos(a) * cfg.arrowSpeed, vy: Math.sin(a) * cfg.arrowSpeed, life: cfg.range / cfg.arrowSpeed + 0.1, dmg: cfg.dmg * G.mods.arrowDmg });
        }
      } else { u.state = 'dash'; u.t = cfg.dashTime; u.vx = ax / ad * cfg.dashSpeed; u.vy = ay / ad * cfg.dashSpeed; u.hit = new Set(); }
    }
  }
}

function updateDeputy(dt) {
  const d = G.deputy; if (!d) return;
  if (d.dead) { d.downT -= dt; if (d.downT <= 0) { d.dead = false; d.hp = d.maxHp; d.x = G.hero.x; d.y = G.hero.y; } return; }
  d.hurtT = Math.max(0, d.hurtT - dt);
  const cfg = DEPUTY.zhoucang, h = G.hero;
  const tgt = nearestEnemy(d.x, d.y, 260);
  const gx = tgt && Math.hypot(tgt.x - h.x, tgt.y - h.y) < 300 ? tgt.x : h.x + Math.cos(h.face + 2.4) * 50, gy = tgt && Math.hypot(tgt.x - h.x, tgt.y - h.y) < 300 ? tgt.y : h.y + Math.sin(h.face + 2.4) * 50;
  const dx = gx - d.x, dy = gy - d.y, dd = Math.hypot(dx, dy);
  if (dd > 6) { const sp = d.speed * (Math.hypot(h.x - d.x, h.y - d.y) > 260 ? 2 : 1); d.x += dx / dd * sp * dt; d.y += dy / dd * sp * dt; }
  d.cd -= dt;
  if (d.spinT > 0) {                                          // 周倉：大刀旋風斬，持續轉一段時間
    d.spinT -= dt; d.tick -= dt;
    if (d.tick <= 0) { d.tick = cfg.spin.tick; for (const e of query(d.x, d.y, cfg.spin.range, QBUF).slice()) if (dist2(e, d) < cfg.spin.range ** 2) damage(e, cfg.spin.dmg * 0.25, (e.x - d.x) * 1.5, (e.y - d.y) * 1.5, '#FFC890'); }
  } else if (d.cd <= 0 && tgt && Math.hypot(tgt.x - d.x, tgt.y - d.y) < 120) { d.cd = cfg.spin.cd; d.spinT = cfg.spin.time; }
}

function updateEnemies(dt) {
  const h = G.hero, friends = [h, ...G.squad, ...(G.deputy && !G.deputy.dead ? [G.deputy] : [])];
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    // 往主將衝（被打退時先滑一段）
    const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d * e.speed + e.kx) * dt; e.y += (dy / d * e.speed + e.ky) * dt;
    e.kx *= Math.pow(0.004, dt); e.ky *= Math.pow(0.004, dt);
    // 互相推開（只看同格的幾個，省效能）
    const c = grid.get(gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL)));
    if (c) for (let i = 0, n = Math.min(c.length, 8); i < n; i++) { const o = c[i]; if (o === e) continue; const ox = e.x - o.x, oy = e.y - o.y, od = ox * ox + oy * oy, rr = e.r + o.r; if (od < rr * rr && od > 0.01) { const k = (rr - Math.sqrt(od)) * 0.5 / Math.sqrt(od); e.x += ox * k; e.y += oy * k; } }
    // 碰到我方：造成傷害
    for (const f of friends) { if (f.dead) continue; const rr = e.r + f.r; if ((e.x - f.x) ** 2 + (e.y - f.y) ** 2 < rr * rr) hurtFriend(f, e.dmg); }
    // 離太遠就收掉（倖存者類慣例：跟不上的直接重生在前方）
    if (d > 1400) e.dead = true;
  }
}

function updateElite(dt) {
  const e = G.elite; if (!e || e.dead) return;
  const h = G.hero; e.flash = Math.max(0, e.flash - dt);
  if (e.warn > 0) {                                             // 重砸：預警圈 → 範圍傷害
    e.warn -= dt;
    if (e.warn <= 0) {
      G.shake = 0.3; G.fx.push({ kind: 'ring', x: e.x, y: e.y, t: 0, dur: 0.4, r: ELITE.slam.range, c: '255,120,60' });
      for (const f of [h, ...G.squad, ...(G.deputy ? [G.deputy] : [])]) if (!f.dead && Math.hypot(f.x - e.x, f.y - e.y) < ELITE.slam.range + f.r) hurtFriend(f, ELITE.slam.dmg);
    }
    return;
  }
  const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1;
  e.x += (dx / d * e.speed + e.kx) * dt; e.y += (dy / d * e.speed + e.ky) * dt; e.kx *= Math.pow(0.01, dt); e.ky *= Math.pow(0.01, dt);
  if (d < e.r + h.r) hurtFriend(h, e.dmg);
  e.slamCd -= dt;
  if (e.slamCd <= 0 && d < 160) { e.slamCd = ELITE.slam.cd; e.warn = ELITE.slam.warn; }
}

function updateArrows(dt) {
  for (let i = G.arrows.length - 1; i >= 0; i--) {
    const a = G.arrows[i]; a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt;
    let hit = null;
    for (const e of query(a.x, a.y, 16, QBUF)) if (!e.dead && (e.x - a.x) ** 2 + (e.y - a.y) ** 2 < (e.r + 3) ** 2) { hit = e; break; }
    if (!hit && G.elite && !G.elite.dead && dist2(G.elite, a) < (G.elite.r + 3) ** 2) hit = G.elite;
    if (hit) { damage(hit, a.dmg, a.vx * 0.05, a.vy * 0.05, G.mods.burn ? '#FFB060' : '#D8F0FF'); if (G.mods.burn) hit.burn = 2; }
    if (hit || a.life <= 0) G.arrows.splice(i, 1);
  }
  for (const e of G.enemies) if (e.burn > 0 && !e.dead) { e.burn -= dt; e.hp -= 6 * dt; if (e.hp <= 0) kill(e); }
}

function updateGems(dt) {
  const h = G.hero;
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const g = G.gems[i], dx = h.x - g.x, dy = h.y - g.y, d = Math.hypot(dx, dy);
    if (d < h.pickup || g.pull) { g.pull = true; const sp = Math.max(260, 600 - d); g.x += dx / (d || 1) * sp * dt; g.y += dy / (d || 1) * sp * dt; }
    if (d < h.r + 6) {
      G.gems.splice(i, 1); G.xp += g.v;
      while (G.xp >= xpNeed(G.lv)) { G.xp -= xpNeed(G.lv); G.lv++; G.cards = dealCards(G); if (G.cards.length) { G.mode = 'levelup'; break; } }
    }
  }
  if (G.gems.length > 600) G.gems.splice(0, G.gems.length - 600);
}

function musouBlast() {                                         // 武將技：以主將為中心的巨大刀氣，清場
  const h = G.hero;
  G.shake = 0.5; G.fx.push({ kind: 'blast', x: h.x, y: h.y, t: 0, dur: 0.7, r: MUSOU.range });
  for (const e of query(h.x, h.y, MUSOU.range, QBUF).slice()) if (dist2(e, h) < MUSOU.range ** 2) damage(e, MUSOU.dmg, (e.x - h.x) * 2, (e.y - h.y) * 2, '#FFD860');
  if (G.elite && !G.elite.dead && dist2(G.elite, h) < MUSOU.range ** 2) damage(G.elite, MUSOU.dmg, 0, 0, '#FFD860');
}

// ───────── 升級三選一、招降選擇 ─────────
const cardRects = () => G.cards.map((c, i) => ({ c, x: W / 2 - 330 + i * 230, y: 150, w: 200, h: 250 }));
function pickCard() {
  for (const t of input.taps) {
    const r = t.key ? cardRects()[t.key - 1] : cardRects().find((q) => t.x >= q.x && t.x <= q.x + q.w && t.y >= q.y && t.y <= q.y + q.h);
    if (!r) continue;
    r.c.apply(G); G.taken[r.c.id] = (G.taken[r.c.id] || 0) + 1; G.cards = [];
    G.mode = 'play';
    if (G.xp >= xpNeed(G.lv)) { G.xp -= xpNeed(G.lv); G.lv++; G.cards = dealCards(G); if (G.cards.length) G.mode = 'levelup'; }   // 一次升好幾級：接著再選
    return;
  }
}
const recruitRects = () => [{ yes: true, x: W / 2 - 170, y: 330, w: 150, h: 50, label: '收為副將' }, { yes: false, x: W / 2 + 20, y: 330, w: 150, h: 50, label: '放他走（換經驗）' }];
function pickRecruit() {
  for (const t of input.taps) {
    if (t.key === 1 || t.enter) { recruit(true); return; } if (t.key === 2) { recruit(false); return; }
    const r = recruitRects().find((q) => t.x >= q.x && t.x <= q.x + q.w && t.y >= q.y && t.y <= q.y + q.h);
    if (r) { recruit(r.yes); return; }
  }
}

// ───────── 繪圖 ─────────
function render() {
  ctx.fillStyle = '#3B4A2E'; ctx.fillRect(0, 0, W, H);
  if (G.mode === 'title') { drawTitle(); return; }
  const h = G.hero, sx = G.shake > 0 ? rand(-4, 4) : 0, sy = G.shake > 0 ? rand(-4, 4) : 0;
  const camX = h.x - W / 2 + sx, camY = h.y - H / 2 + sy;
  ctx.save(); ctx.translate(-camX, -camY);
  // 地面格線
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  for (let x = Math.floor(camX / 80) * 80; x < camX + W; x += 80) { ctx.beginPath(); ctx.moveTo(x, camY); ctx.lineTo(x, camY + H); ctx.stroke(); }
  for (let y = Math.floor(camY / 80) * 80; y < camY + H; y += 80) { ctx.beginPath(); ctx.moveTo(camX, y); ctx.lineTo(camX + W, y); ctx.stroke(); }
  // 經驗寶石
  ctx.fillStyle = '#5FD3FF';
  for (const g of G.gems) { const s = g.v >= 5 ? 6 : g.v >= 2 ? 5 : 4; ctx.fillRect(g.x - s / 2, g.y - s / 2, s, s); }
  // 敵人（只畫畫面內的）
  for (const e of G.enemies) {
    if (e.x < camX - 30 || e.x > camX + W + 30 || e.y < camY - 30 || e.y > camY + H + 30) continue;
    ctx.fillStyle = e.flash > 0 ? '#FFFFFF' : e.burn > 0 ? '#FF7A3A' : e.color;
    ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(e.x - e.r, e.y + e.r - 3, e.r * 2, 3);
  }
  // 精英武將
  if (G.elite && !G.elite.dead) {
    const e = G.elite;
    if (e.warn > 0) { ctx.fillStyle = `rgba(255,80,40,${0.2 + 0.2 * Math.sin(G.t * 30)})`; ctx.beginPath(); ctx.arc(e.x, e.y, ELITE.slam.range, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = e.flash > 0 ? '#FFF' : '#C0392B'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFD24A'; ctx.lineWidth = 3; ctx.stroke();
    label(ELITE.name, e.x, e.y - e.r - 14, '#FFD24A');
    hpBar(e.x - 30, e.y - e.r - 8, 60, e.hp / e.maxHp, '#E74C3C');
  }
  // 部隊
  for (const u of G.squad) {
    ctx.fillStyle = u.hurtT > 0 ? '#FFF' : u.kind === 'archer' ? '#4A90E2' : '#3CC8C8';
    if (u.kind === 'archer') { ctx.beginPath(); ctx.moveTo(u.x, u.y - u.r); ctx.lineTo(u.x + u.r, u.y + u.r); ctx.lineTo(u.x - u.r, u.y + u.r); ctx.closePath(); ctx.fill(); }
    else { ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-u.r * 0.8, -u.r * 0.8, u.r * 1.6, u.r * 1.6); ctx.restore(); }
    if (u.hp < u.maxHp) hpBar(u.x - 10, u.y + u.r + 3, 20, u.hp / u.maxHp, '#7CE07C');
  }
  // 副將
  if (G.deputy && !G.deputy.dead) {
    const d = G.deputy;
    if (d.spinT > 0) { ctx.strokeStyle = 'rgba(255,200,140,0.7)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(d.x, d.y, DEPUTY.zhoucang.spin.range * 0.9, G.t * 18, G.t * 18 + 4); ctx.stroke(); }
    ctx.fillStyle = d.hurtT > 0 ? '#FFF' : '#8E44AD'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    label(d.name, d.x, d.y - d.r - 8, '#E8C8FF');
  }
  // 箭
  ctx.strokeStyle = G.mods.burn ? '#FFB060' : '#E8F4FF'; ctx.lineWidth = 2;
  for (const a of G.arrows) { const l = 0.02; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - a.vx * l, a.y - a.vy * l); ctx.stroke(); }
  // 主將
  ctx.fillStyle = h.hurtT > 0 && Math.floor(G.t * 20) % 2 ? '#FFFFFF' : '#2E8B57';
  ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#FFD24A'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = '#FFD24A'; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + Math.cos(h.face) * 24, h.y + Math.sin(h.face) * 24); ctx.stroke();
  label(HERO.name, h.x, h.y - h.r - 8, '#FFF');
  // 特效
  for (const f of G.fx) {
    const k = f.t / f.dur;
    if (f.kind === 'sweep') { ctx.fillStyle = `rgba(255,240,180,${0.45 * (1 - k)})`; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.range, f.face - f.half, f.face + f.half); ctx.closePath(); ctx.fill(); }
    else if (f.kind === 'ring') { ctx.strokeStyle = `rgba(${f.c},${1 - k})`; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.8), 0, Math.PI * 2); ctx.stroke(); }
    else if (f.kind === 'blast') { ctx.fillStyle = `rgba(255,220,120,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + k), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = `rgba(255,255,220,${1 - k})`; ctx.lineWidth = 10 * (1 - k) + 2; ctx.stroke(); }
  }
  // 飄字
  ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center';
  for (const s of G.texts) { ctx.globalAlpha = 1 - s.t / 0.6; ctx.fillStyle = s.c; ctx.fillText(s.s, s.x, s.y - s.t * 30); }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawHUD();
  if (G.mode === 'cutin') drawCutin();
  if (G.mode === 'levelup') drawCards();
  if (G.mode === 'recruit') drawRecruit();
  if (G.mode === 'over' || G.mode === 'win') drawEnd();
}
function label(s, x, y, c) { ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(s, x, y); ctx.fillStyle = c; ctx.fillText(s, x, y); }
function hpBar(x, y, w, k, c) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, 4); ctx.fillStyle = c; ctx.fillRect(x, y, w * clamp(k, 0, 1), 4); }
function panel(x, y, w, h) { ctx.fillStyle = 'rgba(20,16,10,0.92)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#C9A24A'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); }
function drawHUD() {
  const h = G.hero;
  hpBar(16, 16, 220, h.hp / h.maxHp, '#E74C3C');
  ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = '#FFF'; ctx.fillText(`${HERO.name}  HP ${Math.ceil(h.hp)}/${h.maxHp}`, 16, 36);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H - 8, W, 8); ctx.fillStyle = '#5FD3FF'; ctx.fillRect(0, H - 8, W * G.xp / xpNeed(G.lv), 8);
  const left = Math.max(0, STAGE.duration - G.t), mm = Math.floor(left / 60), ss = Math.floor(left % 60);
  ctx.textAlign = 'center'; ctx.font = `bold 22px ${FONT}`; ctx.fillStyle = '#FFF'; ctx.fillText(`${mm}:${String(ss).padStart(2, '0')}`, W / 2, 34);
  ctx.font = `12px ${FONT}`; ctx.fillText(`${STAGE.name}　Lv ${G.lv}　擊殺 ${G.kills}`, W / 2, 52);
  ctx.textAlign = 'right'; ctx.fillText(`弓手 ${G.squad.filter((u) => u.kind === 'archer').length}/${G.squadMax.archer}　騎兵 ${G.squad.filter((u) => u.kind === 'cavalry').length}/${G.squadMax.cavalry}　副將 ${G.deputy ? G.deputy.name + (G.deputy.dead ? '（倒地）' : '') : '—'}`, W - 16, 28);
  if (DEBUG) ctx.fillText(`FPS ${fps}　敵人 ${G.enemies.length}　箭 ${G.arrows.length}　寶石 ${G.gems.length}`, W - 16, 46);
  // 武將技按鈕（集氣圈）
  const full = G.musou >= MUSOU.need, b = SKILL_BTN;
  ctx.fillStyle = full ? `rgba(255,200,60,${0.75 + 0.25 * Math.sin(G.t * 8)})` : 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#FFD24A'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * G.musou / MUSOU.need); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = full ? '#3A1A00' : '#FFF'; ctx.font = `bold 14px ${FONT}`; ctx.fillText('武將技', b.x, b.y + 5);
  // 觸控搖桿
  if (stick.id !== null) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 50, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(clamp(stick.x, stick.ox - 50, stick.ox + 50), clamp(stick.y, stick.oy - 50, stick.oy + 50), 20, 0, Math.PI * 2); ctx.fill(); }
  for (const f of G.fx) if (f.kind === 'banner') { const a = Math.min(1, f.t * 4, (f.dur - f.t) * 3); ctx.globalAlpha = a; panel(W / 2 - 230, 80, 460, 40); ctx.fillStyle = '#FFE6A8'; ctx.font = `bold 16px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(f.s, W / 2, 106); ctx.globalAlpha = 1; }
}
function drawCutin() {                                          // 武將技立繪特寫（原型：色塊＋大字，之後換 AI 立繪）
  const k = 1 - G.cutin / MUSOU.cutin, slide = Math.min(1, k * 4);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate((1 - slide) * -W, 0);
  ctx.fillStyle = '#1E5C3A'; ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(W, 110); ctx.lineTo(W, 390); ctx.lineTo(0, 430); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2E8B57'; ctx.fillRect(80, 160, 220, 260); ctx.fillStyle = '#FFD24A'; ctx.font = `bold 20px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('（關羽立繪）', 190, 300);
  ctx.textAlign = 'left'; ctx.font = `bold 64px ${FONT}`; ctx.lineWidth = 8; ctx.strokeStyle = '#2A1200'; ctx.strokeText(MUSOU.name, 340, 300); ctx.fillStyle = '#FFE070'; ctx.fillText(MUSOU.name, 340, 300);
  ctx.restore();
}
function drawCards() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#FFD24A'; ctx.font = `bold 28px ${FONT}`; ctx.fillText(`升級！Lv ${G.lv}　選一項強化`, W / 2, 120);
  const catColor = { 武將: '#E8B84A', 屬性: '#7CC8F0', 部隊: '#7CE07C' };
  cardRects().forEach((r, i) => {
    panel(r.x, r.y, r.w, r.h);
    ctx.fillStyle = catColor[r.c.cat]; ctx.font = `bold 14px ${FONT}`; ctx.fillText(`【${r.c.cat}】`, r.x + r.w / 2, r.y + 34);
    ctx.fillStyle = '#FFF'; ctx.font = `bold 24px ${FONT}`; ctx.fillText(r.c.name, r.x + r.w / 2, r.y + 90);
    ctx.font = `14px ${FONT}`; ctx.fillStyle = '#E8E0D0'; ctx.fillText(r.c.desc, r.x + r.w / 2, r.y + 140);
    const n = G.taken[r.c.id] || 0; ctx.fillStyle = '#9A8E78'; ctx.font = `12px ${FONT}`; ctx.fillText(`已拿 ${n}/${r.c.max}　按 ${i + 1}`, r.x + r.w / 2, r.y + r.h - 18);
  });
}
function drawRecruit() {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
  panel(W / 2 - 240, 150, 480, 260);
  ctx.textAlign = 'center'; ctx.fillStyle = '#FFD24A'; ctx.font = `bold 26px ${FONT}`; ctx.fillText(`${G.recruitAsk.name}：「願降！願隨將軍征戰！」`, W / 2, 210);
  ctx.fillStyle = '#E8E0D0'; ctx.font = `15px ${FONT}`; ctx.fillText('收為副將：他會跟著你作戰，定期施放「大刀旋風斬」', W / 2, 260);
  ctx.fillText('放他走：換一大把經驗', W / 2, 284);
  for (const b of recruitRects()) { ctx.fillStyle = b.yes ? '#8A5A1A' : '#3A4A5A'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = '#FFD24A'; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.fillStyle = '#FFF'; ctx.font = `bold 16px ${FONT}`; ctx.fillText(b.label, b.x + b.w / 2, b.y + 31); }
}
function drawEnd() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = G.mode === 'win' ? '#FFD24A' : '#E74C3C'; ctx.font = `bold 44px ${FONT}`;
  ctx.fillText(G.mode === 'win' ? '黃巾潰散！' : '關羽力竭……', W / 2, 220);
  ctx.fillStyle = '#FFF'; ctx.font = `18px ${FONT}`; ctx.fillText(`撐過 ${Math.floor(G.t / 60)} 分 ${Math.floor(G.t % 60)} 秒　Lv ${G.lv}　擊殺 ${G.kills}`, W / 2, 270);
  ctx.fillStyle = '#C8B89A'; ctx.font = `15px ${FONT}`; ctx.fillText('點一下（或按 Enter）再戰一次', W / 2, 320);
}
function drawTitle() {
  ctx.textAlign = 'center'; ctx.fillStyle = '#FFD24A'; ctx.font = `bold 48px ${FONT}`; ctx.fillText('三國武將倖存者（原型）', W / 2, 190);
  ctx.fillStyle = '#FFF'; ctx.font = `17px ${FONT}`; ctx.fillText('關羽帶著弓手、騎兵，撐過黃巾軍 8 分鐘。擊敗周倉可以招降成副將。', W / 2, 240);
  ctx.fillStyle = '#C8B89A'; ctx.font = `14px ${FONT}`;
  ctx.fillText('移動：WASD／方向鍵，手機在左半邊拖曳　　武將技：空白鍵／右下按鈕　　升級：點卡片或按 1～3', W / 2, 280);
  ctx.fillStyle = `rgba(255,230,168,${0.6 + 0.4 * Math.sin(performance.now() / 200)})`; ctx.font = `bold 18px ${FONT}`; ctx.fillText('點一下開始', W / 2, 340);
}

// ───────── 主迴圈 ─────────
let last = performance.now(), fps = 60, fpsAcc = 0, fpsN = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  update(dt); render(); input.taps.length = 0;
  requestAnimationFrame(frame);
}
newGame();
window.__game = { get G() { return G; }, spawn: (n, kind = 'footman') => { for (let i = 0; i < n; i++) spawnEnemy(kind); }, spawnElite, get fps() { return fps; } };
requestAnimationFrame(frame);
