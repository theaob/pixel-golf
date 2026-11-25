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
