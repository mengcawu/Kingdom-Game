// 升級三選一的卡池。每張卡：分類（武將／屬性／部隊）、名稱、說明、最多拿幾次、套用效果。
// G 是遊戲狀態（見 main.js 的 newGame）。

export const CARDS = [
  // ── 武將技能（關羽）──
  { id: 'sweepDmg', cat: '武將', name: '刀勢', desc: '橫掃傷害 +25%', max: 5, apply: (G) => { G.hero.sweepDmg *= 1.25; } },
  { id: 'sweepArc', cat: '武將', name: '偃月', desc: '橫掃角度 +40°', max: 3, apply: (G) => { G.hero.sweepArc = Math.min(360, G.hero.sweepArc + 40); } },
  { id: 'sweepRange', cat: '武將', name: '青龍', desc: '橫掃範圍 +15%', max: 4, apply: (G) => { G.hero.sweepRange *= 1.15; } },
  { id: 'sweepCd', cat: '武將', name: '迅刀', desc: '橫掃冷卻 -12%', max: 4, apply: (G) => { G.hero.sweepCd *= 0.88; } },
  { id: 'double', cat: '武將', name: '回馬刀', desc: '橫掃後再往背後補一刀', max: 1, apply: (G) => { G.hero.backSweep = true; } },
  { id: 'musouGain', cat: '武將', name: '武聖之怒', desc: '武將技集氣速度 +30%', max: 3, apply: (G) => { G.hero.musouGain *= 1.3; } },
  // ── 屬性 ──
  { id: 'hp', cat: '屬性', name: '虎體', desc: '最大 HP +40，並回滿', max: 5, apply: (G) => { G.hero.maxHp += 40; G.hero.hp = G.hero.maxHp; } },
  { id: 'speed', cat: '屬性', name: '赤兔', desc: '移動速度 +10%', max: 4, apply: (G) => { G.hero.speed *= 1.1; } },
  { id: 'regen', cat: '屬性', name: '養氣', desc: '每秒回復 1.5 HP', max: 4, apply: (G) => { G.hero.regen += 1.5; } },
  { id: 'pickup', cat: '屬性', name: '軍需', desc: '經驗吸取範圍 +40%', max: 3, apply: (G) => { G.hero.pickup *= 1.4; } },
  // ── 部隊 ──
  { id: 'archerAdd', cat: '部隊', name: '增募弓手', desc: '弓手 +1（上限 6）', max: 4, apply: (G) => { G.squadMax.archer++; } },
  { id: 'cavAdd', cat: '部隊', name: '增募騎兵', desc: '騎兵 +1（上限 6）', max: 4, apply: (G) => { G.squadMax.cavalry++; } },
  { id: 'multishot', cat: '部隊', name: '連弩', desc: '弓手每次多射 1 支箭', max: 2, apply: (G) => { G.mods.arrows++; } },
  { id: 'fireArrow', cat: '部隊', name: '火矢', desc: '弓箭傷害 +40%，命中點燃', max: 2, apply: (G) => { G.mods.arrowDmg *= 1.4; G.mods.burn = true; } },
  { id: 'ironCav', cat: '部隊', name: '鐵騎', desc: '騎兵衝鋒傷害 +50%，撞飛敵人', max: 3, apply: (G) => { G.mods.cavDmg *= 1.5; G.mods.cavKnock += 120; } },
  { id: 'medic', cat: '部隊', name: '軍醫', desc: '部隊每秒回 3% HP，陣亡補員快 40%', max: 2, apply: (G) => { G.mods.squadRegen += 0.03; G.mods.respawn *= 0.6; } },
];

// 抽三張：已拿滿的不出現；副將相關卡只有在有副將時才出現
export function drawCards(G, n = 3) {
  const pool = CARDS.filter((c) => (G.taken[c.id] || 0) < c.max && (!c.needDeputy || G.deputy));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
