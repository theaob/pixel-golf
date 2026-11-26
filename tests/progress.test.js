import assert from 'node:assert/strict';
import { createProgress, starsFor, SAVE_KEY } from '../src/progress.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m };
};

assert.equal(starsFor(2, 3), 3);
assert.equal(starsFor(3, 3), 2);
assert.equal(starsFor(5, 3), 1);
assert.equal(starsFor(10, 3, true), 0);

// Streaks: consecutive days extend, a gap resets, replays don't count twice.
{
  const p = createProgress(mem());
  assert.equal(p.recordDaily('2026-11-30', 3, 3).streak, 1);
  assert.equal(p.recordDaily('2026-11-30', 2, 3).first, false);
  assert.equal(p.recordDaily('2026-12-01', 3, 3).streak, 2);
  assert.equal(p.streak('2026-12-02'), 2); // still alive the next day
  assert.equal(p.streak('2026-12-03'), 0); // broken after a missed day
  assert.equal(p.recordDaily('2026-12-03', 3, 3).streak, 1);
  assert.equal(p.data.daily.best, 2);
  assert.equal(p.dailyResult('2026-11-30'), 3);
}

// Coins, stars, skins and persistence.
{
  const s = mem();
  const p = createProgress(s);
  const r = p.recordHole('front:0', 1, 2);
  assert.equal(r.stars, 3);
  assert.equal(r.coins, 3 * 2 + 3 * 10 + 15);
  const r2 = p.recordHole('front:0', 2, 2); // worse: no new star bonus
  assert.equal(r2.coins, 4);
  assert.equal(p.bestFor('front:0'), 1);
  assert.equal(p.courseStars('front', [{ par: 2 }, { par: 3 }]), 3);
  assert.equal(p.buy('gold'), false); // too expensive
  assert.equal(p.data.coins, 55);
  assert.equal(p.buy('sunny'), false); // costs 60
  p.data.coins = 1000;
  assert.equal(p.buy('gold'), true);
  assert.equal(p.equipped().id, 'gold');
  assert.equal(p.buy('gold'), false); // already owned
  assert.equal(p.equip('classic'), true);
  const reloaded = createProgress(s);
  assert.equal(reloaded.data.coins, 500);
  assert.deepEqual(reloaded.data.skins.owned, ['classic', 'gold']);
  assert.ok(s.m.has(SAVE_KEY));
}

// Daily gift grows with consecutive days and resets after a gap.
{
  const p = createProgress(mem());
  assert.equal(p.claimGift('2026-12-01'), 10);
  assert.equal(p.claimGift('2026-12-01'), 0);
  assert.equal(p.claimGift('2026-12-02'), 15);
  assert.equal(p.claimGift('2026-12-04'), 10);
}

// Migrates best rounds from older versions.
{
  const s = mem();
  s.setItem('pg-best', '27');
  assert.equal(createProgress(s).data.rounds.front, 27);
}
console.log('progress: ok');

// Clubs, free-coin cap, streak saver.
{
  const p = createProgress(mem());
  const { CLUBS } = await import('../src/progress.js');
  assert.equal(p.club().id, 'classic');
  assert.equal(p.buyClub('pro'), false);
  p.addCoins(2000);
  assert.equal(p.buyClub('golden'), true);
  assert.equal(p.club().id, 'golden');
  const r = p.recordHole('frost:0', 3, 3); // 2 stars: 4 + 20 = 24, +25% = 30
  assert.equal(r.coins, 30);
  p.trialClub = 'bruiser';
  assert.equal(p.club().power, CLUBS.find((c) => c.id === 'bruiser').power);
  p.trialClub = null;
  assert.equal(p.equipClub('scout'), false); // not owned
  for (let i = 0; i < 5; i++) assert.equal(p.claimFreeCoins('2026-12-01'), 25);
  assert.equal(p.claimFreeCoins('2026-12-01'), 0);
  assert.equal(p.freeCoinsLeft('2026-12-02'), 5);

  p.recordDaily('2026-12-01', 3, 3);
  p.recordDaily('2026-12-02', 3, 3);
  assert.equal(p.streakSavable('2026-12-03'), false); // nothing missed yet
  assert.equal(p.streakSavable('2026-12-04'), true); // missed the 3rd
  assert.equal(p.saveStreak('2026-12-04'), true);
  assert.equal(p.streak('2026-12-04'), 2);
  assert.equal(p.recordDaily('2026-12-04', 3, 3).streak, 3);
  assert.equal(p.streakSavable('2026-12-06'), true);
  assert.equal(p.saveStreak('2026-12-06'), true);
  assert.equal(p.streakSavable('2026-12-08'), false); // two missed days (6th, 7th) can't be rescued
}
console.log('progress clubs/ads: ok');

// Cosmetics catalogue and awards.
{
  const { CATALOG } = await import('../src/progress.js');
  const { AWARDS } = await import('../src/unlockables.js');
  // Every award reward exists, and award-only items can't be bought.
  for (const a of AWARDS) if (a.reward) assert.ok(CATALOG[a.reward.cat].some((x) => x.id === a.reward.id), a.id);
  for (const [cat, items] of Object.entries(CATALOG)) {
    for (const it of items) {
      if (it.award) assert.ok(AWARDS.some((a) => a.id === it.award && a.reward?.id === it.id && a.reward.cat === cat), `${cat}:${it.id}`);
      else assert.equal(typeof it.price, 'number', `${cat}:${it.id} needs a price`);
    }
  }
  const p = createProgress(mem());
  const ctx = { stars: 0, allStars: 126, allCourses: 6 };
  p.addCoins(1000);
  assert.equal(p.buyItem('flags', 'checkered'), false); // award-only
  assert.equal(p.buyItem('trails', 'smoke'), true);
  assert.equal(p.equippedItem('trails').id, 'smoke');
  assert.equal(p.equipItem('trails', 'match'), true);
  assert.deepEqual(p.checkAwards(ctx).map((a) => a.id), []);
  const coins = p.data.coins;
  p.recordHole('front:0', 1, 2); // first hole + ace
  const got = p.checkAwards({ ...ctx, stars: 3 }).map((a) => a.id);
  assert.deepEqual(got.sort(), ['ace', 'first-sink']);
  assert.ok(p.ownsItem('fx', 'fireworks'));
  assert.ok(p.data.coins > coins);
  assert.deepEqual(p.checkAwards({ ...ctx, stars: 3 }), []); // only once
  for (let i = 0; i < 100; i++) p.bump('bumpers');
  assert.deepEqual(p.checkAwards(ctx).map((a) => a.id), ['bumpers-100']);
  assert.ok(p.ownsItem('balls', 'chrome'));
  assert.deepEqual(p.awardProgress(AWARDS.find((a) => a.id === 'stars-all'), { ...ctx, stars: 40 }), [40, 126]);
  for (const id of ['front', 'back', 'frost', 'desert', 'volcano', 'space']) p.recordRound(id, 10, 30);
  assert.ok(p.checkAwards(ctx).some((a) => a.id === 'all-courses'));
  assert.ok(p.hasAward('under-par-round'));
}
console.log('progress cosmetics/awards: ok');
