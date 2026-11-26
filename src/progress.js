// Player progress: coins, stars, daily streak, daily gift, skins, settings.
// Pure logic over a key/value storage so it can be unit tested in Node.
import { addDays } from './daily.js';
import { TRAILS, FLAGS, CELEBRATIONS, AWARDS } from './unlockables.js';

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
  // Patterned balls. `pattern`: band (default), stripes, checker, split, rainbow, disco.
  { id: 'candy', name: 'CANDY', price: 140, a: 0xffffff, b: 0xff4f5e, trail: 0xff8fa8, pattern: 'stripes' },
  { id: 'soccer', name: 'SOCCER', price: 180, a: 0xffffff, b: 0x1a1426, trail: 0xffffff, pattern: 'checker' },
  { id: 'melon', name: 'MELON', price: 180, a: 0x4f9f3a, b: 0x9fd86a, trail: 0xff4f5e, pattern: 'stripes' },
  { id: 'beach', name: 'BEACH', price: 280, a: 0xffffff, b: 0xff4f5e, trail: 0x5ec8ff, pattern: 'rainbow' },
  { id: 'eclipse', name: 'ECLIPSE', price: 350, a: 0x1a1426, b: 0xffd166, trail: 0xffd166, pattern: 'split' },
  { id: 'veteran', name: 'VETERAN', award: 'holes-100', a: 0x3a5a2a, b: 0xd9b46a, trail: 0xd9b46a, pattern: 'stripes' },
  { id: 'chrome', name: 'CHROME', award: 'bumpers-100', a: 0xe6eaf2, b: 0x8a93a6, trail: 0xffffff, pattern: 'checker' },
  { id: 'disco', name: 'DISCO', award: 'aces-10', a: 0xff4fd8, b: 0x2affd5, trail: 0xffd166, pattern: 'disco' },
];

// Every cosmetic category the shop sells. Balls live in data.skins for
// backwards compatibility with older saves.
export const CATALOG = { balls: SKINS, trails: TRAILS, flags: FLAGS, fx: CELEBRATIONS };

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
    stats: {
      holes: 0, rounds: 0, aces: 0, underPar: 0, roundsUnderPar: 0, dailies: 0,
      bumpers: 0, spinners: 0, splashes: 0, portals: 0, coursesDone: [],
    },
    cosmetics: {
      trails: { owned: ['match', 'none'], equipped: 'match' },
      flags: { owned: ['classic'], equipped: 'classic' },
      fx: { owned: ['confetti'], equipped: 'confetti' },
    },
    awards: [],
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
      data = {
        ...base,
        ...saved,
        stats: { ...base.stats, ...saved.stats },
        cosmetics: { ...base.cosmetics, ...saved.cosmetics },
      };
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
      if (!pickedUp && strokes === 1) data.stats.aces += 1;
      if (!pickedUp && strokes < par) data.stats.underPar += 1;
      persist();
      return { stars, prevStars, coins };
    },
    addCoins(n) {
      data.coins += n;
      persist();
    },
    // In-memory counter; saved with the next persisted change.
    bump(stat, n = 1) {
      data.stats[stat] = (data.stats[stat] || 0) + n;
    },
    recordRound(courseId, total, par = Infinity) {
      data.stats.rounds += 1;
      if (total < par) data.stats.roundsUnderPar += 1;
      if (!data.stats.coursesDone.includes(courseId)) data.stats.coursesDone.push(courseId);
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
      data.stats.dailies += 1;
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
      return api.ownsItem('balls', id);
    },
    equipped() {
      return SKINS.find((s) => s.id === data.skins.equipped) ?? SKINS[0];
    },
    buy(id) {
      return api.buyItem('balls', id);
    },
    equip(id) {
      return api.equipItem('balls', id);
    },

    // ---- generic cosmetics (balls, trails, flags, fx)
    slot(cat) {
      return cat === 'balls' ? data.skins : data.cosmetics[cat];
    },
    item(cat, id) {
      return CATALOG[cat].find((x) => x.id === id);
    },
    ownsItem(cat, id) {
      return api.slot(cat).owned.includes(id);
    },
    equippedItem(cat) {
      return api.item(cat, api.slot(cat).equipped) ?? CATALOG[cat][0];
    },
    buyItem(cat, id) {
      const it = api.item(cat, id);
      if (!it || it.award || api.ownsItem(cat, id) || data.coins < it.price) return false;
      data.coins -= it.price;
      api.slot(cat).owned.push(id);
      api.slot(cat).equipped = id;
      persist();
      return true;
    },
    equipItem(cat, id) {
      if (!api.ownsItem(cat, id)) return false;
      api.slot(cat).equipped = id;
      persist();
      return true;
    },
    grantItem(cat, id) {
      if (!api.item(cat, id) || api.ownsItem(cat, id)) return false;
      api.slot(cat).owned.push(id);
      persist();
      return true;
    },

    // ---- awards. ctx: { stars, allStars, allCourses }
    awardProgress(award, ctx) {
      const value =
        award.stat === 'stars' ? ctx.stars
        : award.stat === 'bestStreak' ? data.daily.best
        : award.stat === 'coursesDone' ? data.stats.coursesDone.length
        : data.stats[award.stat] || 0;
      const goal = typeof award.goal === 'number' ? award.goal : ctx[award.goal];
      return [Math.min(value, goal), goal];
    },
    hasAward(id) {
      return data.awards.includes(id);
    },
    // Grants every newly completed award and returns them.
    checkAwards(ctx) {
      const earned = [];
      for (const a of AWARDS) {
        if (api.hasAward(a.id)) continue;
        const [v, goal] = api.awardProgress(a, ctx);
        if (v < goal) continue;
        data.awards.push(a.id);
        if (a.reward && !api.ownsItem(a.reward.cat, a.reward.id)) api.slot(a.reward.cat).owned.push(a.reward.id);
        if (a.coins) data.coins += a.coins;
        earned.push(a);
      }
      if (earned.length) persist();
      return earned;
    },

    // ---- settings
    setReminders(enabled) {
      data.reminders = { asked: true, enabled };
      persist();
    },
  };
  return api;
}
