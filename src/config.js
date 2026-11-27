// 所有數值集中在這裡：調手感、調難度只改這個檔案。單位：距離＝像素、時間＝秒。

export const VIEW = { w: 960, h: 540 };          // 邏輯畫面（橫式），會等比縮放填滿螢幕

// 主將：關羽（青龍偃月刀，扇形橫掃）
export const HERO = {
  name: '關羽', hp: 220, speed: 150, r: 14,
  sweep: { dmg: 34, range: 86, arc: 120, cd: 1.0, knock: 140 },   // 扇形橫掃：傷害、半徑、角度（度）、冷卻、擊退
  regen: 0,                                                         // 每秒回血
  pickup: 70,                                                       // 經驗寶石吸取半徑
  invuln: 0.5,                                                      // 被打後無敵時間
};

// 部隊（少量、代表部隊的概念）
export const SQUAD = {
  archer: { name: '弓手', hp: 60, speed: 150, r: 8, range: 300, cd: 0.9, dmg: 14, arrowSpeed: 520, start: 2, max: 6 },
  cavalry: { name: '騎兵', hp: 90, speed: 175, r: 10, range: 240, dashSpeed: 520, dashTime: 0.45, cd: 2.2, dmg: 22, start: 2, max: 6 },
  respawn: 12,                                                      // 部隊陣亡後幾秒補回
};

// 副將（擊敗精英武將後招降）
export const DEPUTY = {
  zhoucang: { name: '周倉', hp: 260, speed: 160, r: 13, spin: { dmg: 40, range: 95, cd: 5, time: 1.2, tick: 0.2 } },
};

// 武將技：殺敵集氣，集滿可放
export const MUSOU = { name: '青龍偃月斬', need: 120, dmg: 320, range: 460, cutin: 1.1 };

// 敵軍：黃巾軍（倖存者式的海量）
export const ENEMY = {
  footman: { name: '黃巾兵', hp: 22, speed: 58, r: 9, dmg: 8, xp: 1, color: '#E8C547' },
  blade: { name: '黃巾刀兵', hp: 48, speed: 72, r: 10, dmg: 12, xp: 2, color: '#E0902E' },
  brute: { name: '黃巾力士', hp: 160, speed: 46, r: 15, dmg: 20, xp: 6, color: '#B8572A' },
};
export const MAX_ENEMIES = 1400;                                    // 同時在場上限
// 出兵節奏：每秒生成數量隨時間增加（[秒, 每秒數量, 種類權重]）
export const WAVES = [
  [0, 4, { footman: 1 }],
  [30, 8, { footman: 1 }],
  [75, 12, { footman: 0.8, blade: 0.2 }],
  [140, 18, { footman: 0.65, blade: 0.3, brute: 0.05 }],
  [220, 26, { footman: 0.55, blade: 0.35, brute: 0.1 }],
  [330, 36, { footman: 0.5, blade: 0.38, brute: 0.12 }],
];

// 精英武將（可招降）
export const ELITE = { key: 'zhoucang', name: '周倉', hp: 1600, speed: 62, r: 22, dmg: 24, at: 100, slam: { cd: 4, range: 110, dmg: 30, warn: 0.7 } };

// 關卡：撐過時間即勝利
export const STAGE = { name: '第一章・黃巾之亂（原型）', duration: 480 };

// 經驗：升到下一級需要的經驗
export const xpNeed = (lv) => Math.round(6 + lv * 4 + lv * lv * 0.6);
