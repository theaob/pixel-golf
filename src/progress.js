// Player progress: coins, stars, daily streak, daily gift, skins, settings.
// Pure logic over a key/value storage so it can be unit tested in Node.
import { addDays } from './daily.js';

export const SAVE_KEY = 'pg-save-v1';

export const SKINS = [
  { id: 'classic', name: 'CLASSIC', price: 0, a: 0xffffff, b: 0xd6dcff, trail: null },
  { id: 'sunny', name: 'SUNNY', price: 60, a: 0xffd166, b: 0xff9f1c, trail: 0xffd166 },
  { id: 'bubblegum', name: 'BUBBLEGUM', price: 90, a: 0xff8fc4, b: 0xffffff, trail: 0xff8fc4 },
  { id: 'mint', name: 'MINT', price: 90, a: 0x7ef0c4, b: 0x2fb38a, trail: 0x7ef0c4 },
  { id: 'lava', name: 'LAVA', price: 150, a: 0xff4f5e, b: 0xffb347, trail: 0xff7a3d },
  { id: 'ocean', name: 'OCEAN', price: 150, a: 0x5ec8ff, b: 0x2a5fd6, trail: 0x9fe3ff },
  { id: 'galaxy', name: 'GALAXY', price: 250, a: 0x8f5bff, b: 0x1a1426, trail: 0xc9b6ff },
  { id: 'gold', name: 'GOLD', price: 500, a: 0xffe066, b: 0xc9932b, trail: 0xfff3b0 },
];

// Clubs change how shots play. `power` scales max shot speed, `guide` the
// aim line length, `preview` how many bounces the aim line simulates.
export const CLUBS = [
  { id: 'classic', name: 'CLASSIC', price: 0, power: 1, guide: 1, preview: 0, head: 0x9aa3b5, grip: 0x1a1426, perk: 'STANDARD' },
  { id: 'longshot', name: 'LONGSHOT', price: 120, power: 1, guide: 1.6, preview: 0, head: 0x5ec8ff, grip: 0x2a5fd6, perk: 'LONG AIM LINE' },
  { id: 'bruiser', name: 'BRUISER', price: 200, power: 1.2, guide: 1, preview: 0, head: 0xff6a3d, grip: 0x5b2a1a, perk: '+20% POWER' },
  { id: 'scout', name: 'SCOUT', price: 300, power: 1, guide: 1.2, preview: 1, head: 0x7ef0c4, grip: 0x1f6b52, perk: 'SEES 1 BOUNCE' },
  { id: 'pro', name: 'PRO', price: 550, power: 1.1, guide: 1.3, preview: 2, head: 0xc9a8ff, grip: 0x3b2a6b, perk: 'SEES 2 BOUNCES' },
  { id: 'golden', name: 'GOLDEN', price: 1000, power: 1.15, guide: 1.5, preview: 3, coinBonus: 0.25, head: 0xffe066, grip: 0x8a5a12, perk: '3 BOUNCES +25% COINS' },
];

// Daily caps for rewarded ads that hand out coins directly.
export const FREE_COINS_AD = { amount: 25, perDay: 5 };

// Stars for a finished hole: 3 under par, 2 at par, 1 otherwise, 0 if picked up.
export function starsFor(strokes, par, pickedUp = false) {
  if (pickedUp) return 0;
  if (strokes < par) return 3;
  if (strokes === par) return 2;
  return 1;
}

function fresh() {
  return {
    v: 1,
    coins: 0,
    holes: {}, // holeId -> best strokes (only completed holes)
    rounds: {}, // course id -> best round total
    daily: { lastKey: null, streak: 0, best: 0, results: {} },
    gift: { lastKey: null, streak: 0 },
    skins: { owned: ['classic'], equipped: 'classic' },
    clubs: { owned: ['classic'], equipped: 'classic' },
    stats: { holes: 0, rounds: 0 },
    adsDay: { key: null, freeCoins: 0 },
    streakSaved: null, // date key of the last missed day an ad rescued
    adsRemoved: false,
    reminders: { asked: false, enabled: false },
  };
}

export function createProgress(storage) {
  let data = fresh();
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw) {
      const base = fresh();
      const saved = JSON.parse(raw);
      data = { ...base, ...saved, stats: { ...base.stats, ...saved.stats } };
    }
    else {
      // Migrate best rounds saved by earlier versions.
      for (const [id, k] of [['front', 'pg-best-front'], ['front', 'pg-best'], ['back', 'pg-best-back']]) {
        const v = Number(storage.getItem(k));
        if (v && !data.rounds[id]) data.rounds[id] = v;
      }
    }
  } catch {}

  const listeners = new Set();
  function persist() {
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {}
    for (const fn of listeners) fn(data);
  }

  const api = {
    get data() {
      return data;
    },
    onChange(fn) {
      listeners.add(fn);
    },
    replace(raw) {
      // Used to restore from a native backup copy.
      data = { ...fresh(), ...raw };
      persist();
    },

    // ---- stars & holes
    bestFor(holeId) {
      return data.holes[holeId] ?? null;
    },
    starsForHole(holeId, par) {
      const b = data.holes[holeId];
      return b == null ? 0 : starsFor(b, par);
    },
    courseStars(courseId, holes) {
      return holes.reduce((a, h, i) => a + api.starsForHole(`${courseId}:${i}`, h.par), 0);
    },
    // Returns { stars, prevStars, coins }.
    recordHole(holeId, strokes, par, pickedUp = false) {
      const prevStars = api.starsForHole(holeId, par);
      const stars = starsFor(strokes, par, pickedUp);
      if (!pickedUp && (data.holes[holeId] == null || strokes < data.holes[holeId])) data.holes[holeId] = strokes;
      let coins = stars * 2;
      if (stars > prevStars) coins += (stars - prevStars) * 10; // first-time star bonus
      if (strokes === 1 && !pickedUp) coins += 15;
      const bonus = Math.round(coins * (api.club().coinBonus || 0));
      coins += bonus;
      data.coins += coins;
      data.stats.holes += 1;
      persist();
      return { stars, prevStars, coins };
    },
    addCoins(n) {
      data.coins += n;
      persist();
    },
    recordRound(courseId, total) {
      data.stats.rounds += 1;
      const prev = data.rounds[courseId] ?? null;
      const isBest = prev == null || total < prev;
      if (isBest) data.rounds[courseId] = total;
      persist();
      return { isBest, prev };
    },

    // ---- daily challenge
    dailyResult(key) {
      return data.daily.results[key] ?? null;
    },
    // Streak as of `today`: alive if the last daily was today or yesterday.
    streak(today) {
      const { lastKey, streak } = data.daily;
      if (lastKey === today || lastKey === addDays(today, -1)) return streak;
      return 0;
    },
    // First finish of the day counts; replays return { first: false }.
    recordDaily(key, strokes, par) {
      if (data.daily.results[key] != null) return { first: false, coins: 0, streak: api.streak(key) };
      const streak = data.daily.lastKey === addDays(key, -1) ? data.daily.streak + 1 : 1;
      data.daily.results[key] = strokes;
      data.daily.lastKey = key;
      data.daily.streak = streak;
      data.daily.best = Math.max(data.daily.best, streak);
      // Keep the history small.
      const keys = Object.keys(data.daily.results).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete data.daily.results[k];
      let coins = 25 + 5 * Math.min(streak - 1, 10);
      if (strokes < par) coins += 10;
      if (strokes === 1) coins += 25;
      data.coins += coins;
      persist();
      return { first: true, coins, streak };
    },

    // A streak broken by exactly one missed day can be rescued (once per gap).
    streakSavable(today) {
      const { lastKey, streak } = data.daily;
      const missed = addDays(today, -1);
      return streak >= 2 && lastKey === addDays(today, -2) && data.streakSaved !== missed && data.daily.results[today] == null;
    },
    saveStreak(today) {
      if (!api.streakSavable(today)) return false;
      const missed = addDays(today, -1);
      data.daily.lastKey = missed; // as if yesterday's hole had been played
      data.streakSaved = missed;
      persist();
      return true;
    },

    // ---- rewarded "free coins" (capped per day)
    freeCoinsLeft(today) {
      return data.adsDay.key === today ? Math.max(0, FREE_COINS_AD.perDay - data.adsDay.freeCoins) : FREE_COINS_AD.perDay;
    },
    claimFreeCoins(today) {
      if (api.freeCoinsLeft(today) <= 0) return 0;
      if (data.adsDay.key !== today) data.adsDay = { key: today, freeCoins: 0 };
      data.adsDay.freeCoins += 1;
      data.coins += FREE_COINS_AD.amount;
      persist();
      return FREE_COINS_AD.amount;
    },

    // ---- clubs (a trial club from a rewarded ad overrides the equipped one)
    trialClub: null,
    club() {
      const id = api.trialClub ?? data.clubs.equipped;
      return CLUBS.find((c) => c.id === id) ?? CLUBS[0];
    },
    ownsClub(id) {
      return data.clubs.owned.includes(id);
    },
    buyClub(id) {
      const club = CLUBS.find((c) => c.id === id);
      if (!club || api.ownsClub(id) || data.coins < club.price) return false;
      data.coins -= club.price;
      data.clubs.owned.push(id);
      data.clubs.equipped = id;
      persist();
      return true;
    },
    equipClub(id) {
      if (!api.ownsClub(id)) return false;
      data.clubs.equipped = id;
      persist();
      return true;
    },

    // ---- daily login gift (grows with consecutive days, capped)
    claimGift(today) {
      if (data.gift.lastKey === today) return 0;
      const streak = data.gift.lastKey === addDays(today, -1) ? data.gift.streak + 1 : 1;
      const coins = 10 + 5 * Math.min(streak - 1, 6);
      data.gift = { lastKey: today, streak };
      data.coins += coins;
      persist();
      return coins;
    },

    // ---- skins
    owns(id) {
      return data.skins.owned.includes(id);
    },
    equipped() {
      return SKINS.find((s) => s.id === data.skins.equipped) ?? SKINS[0];
    },
    buy(id) {
      const skin = SKINS.find((s) => s.id === id);
      if (!skin || api.owns(id) || data.coins < skin.price) return false;
      data.coins -= skin.price;
      data.skins.owned.push(id);
      data.skins.equipped = id;
      persist();
      return true;
    },
    equip(id) {
      if (!api.owns(id)) return false;
      data.skins.equipped = id;
      persist();
      return true;
    },

    // ---- settings
    setReminders(enabled) {
      data.reminders = { asked: true, enabled };
      persist();
    },
  };
  return api;
}
