import assert from 'node:assert/strict';
import { shouldShowInterstitial, PACING } from '../src/ads.js';

const base = { adsRemoved: false, lifetimeHoles: 20, lastInterstitial: null, lastRewarded: null, holesSinceInterstitial: 3 };
const now = 1_000_000;
assert.equal(shouldShowInterstitial(base, 'round', now), true);
assert.equal(shouldShowInterstitial({ ...base, adsRemoved: true }, 'round', now), false);
assert.equal(shouldShowInterstitial({ ...base, lifetimeHoles: PACING.firstHolesFree - 1 }, 'round', now), false);
assert.equal(shouldShowInterstitial({ ...base, lastInterstitial: now - 60_000 }, 'round', now), false);
assert.equal(shouldShowInterstitial({ ...base, lastInterstitial: now - PACING.minGapMs }, 'round', now), true);
assert.equal(shouldShowInterstitial({ ...base, lastRewarded: now - 10_000 }, 'round', now), false);
assert.equal(shouldShowInterstitial({ ...base, holesSinceInterstitial: 2 }, 'hole', now), false);
assert.equal(shouldShowInterstitial({ ...base, holesSinceInterstitial: 2 }, 'round', now), true);
console.log('ads pacing: ok');
