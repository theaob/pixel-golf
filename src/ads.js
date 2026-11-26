// Ads: rewarded videos (opt-in, player chooses) and interstitials (only at
// natural breaks, with strict pacing). AdMob on Android; a visible mock in
// development or with ?ads=mock on the web; nothing otherwise.
import { AdMob, AdmobConsentStatus, RewardAdPluginEvents } from '@capacitor-community/admob';

// Google's public TEST ids. Replace with your own before publishing (README).
export const AD_CONFIG = {
  testing: true,
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
};

export const PACING = {
  firstHolesFree: 5, // no interstitials until a player has finished this many holes ever
  minGapMs: 150_000, // between interstitials
  afterRewardedMs: 60_000, // never right after the player chose to watch one
  holesBetween: 3, // between-hole interstitials at most every N holes
};

// Pure decision so it can be unit tested. `reason` is 'hole' or 'round'.
export function shouldShowInterstitial(s, reason, now) {
  if (s.adsRemoved) return false;
  if (s.lifetimeHoles < PACING.firstHolesFree) return false;
  if (s.lastInterstitial != null && now - s.lastInterstitial < PACING.minGapMs) return false;
  if (s.lastRewarded != null && now - s.lastRewarded < PACING.afterRewardedMs) return false;
  if (reason === 'hole' && s.holesSinceInterstitial < PACING.holesBetween) return false;
  return true;
}

export function createAds({ isNative, progress, mock = false, now = () => Date.now() }) {
  const state = {
    ready: { rewarded: false, interstitial: false },
    canRequest: false,
    lastInterstitial: null,
    lastRewarded: null,
    holesSinceInterstitial: 0,
    privacyRequired: false,
  };
  const provider = isNative ? 'admob' : mock ? 'mock' : null;

  async function preload(kind) {
    if (provider !== 'admob' || !state.canRequest) return;
    try {
      if (kind === 'rewarded') await AdMob.prepareRewardVideoAd({ adId: AD_CONFIG.rewarded, isTesting: AD_CONFIG.testing });
      else await AdMob.prepareInterstitial({ adId: AD_CONFIG.interstitial, isTesting: AD_CONFIG.testing });
      state.ready[kind] = true;
    } catch {
      state.ready[kind] = false;
    }
  }

  // A full-screen placeholder so ad flows can be tested without an ad network.
  function mockAd(kind) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'mock-ad';
      let left = kind === 'rewarded' ? 3 : 2;
      el.innerHTML = `<div class="mock-ad-box"><p>${kind === 'rewarded' ? 'REWARDED' : 'INTERSTITIAL'} AD</p><p class="mock-ad-t">${left}</p><small>TEST PLACEHOLDER</small></div>`;
      document.body.appendChild(el);
      const t = setInterval(() => {
        left -= 1;
        el.querySelector('.mock-ad-t').textContent = left > 0 ? left : 'CLOSE ✕';
        if (left <= 0) {
          clearInterval(t);
          el.addEventListener('click', () => {
            el.remove();
            resolve(true);
          });
        }
      }, 1000);
    });
  }

  const ads = {
    provider,
    get available() {
      return !!provider;
    },
    get privacyRequired() {
      return state.privacyRequired;
    },

    async init() {
      if (provider !== 'admob') {
        state.canRequest = provider === 'mock';
        return;
      }
      try {
        await AdMob.initialize({ initializeForTesting: AD_CONFIG.testing });
        let info = await AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
          info = await AdMob.showConsentForm();
        }
        state.canRequest = info.canRequestAds ?? info.status !== AdmobConsentStatus.REQUIRED;
        state.privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        AdMob.addListener(RewardAdPluginEvents.Dismissed, () => preload('rewarded'));
        await Promise.all([preload('rewarded'), preload('interstitial')]);
      } catch {
        state.canRequest = false;
      }
    },

    async showPrivacyOptions() {
      if (provider === 'admob') {
        try {
          await AdMob.showPrivacyOptionsForm();
        } catch {}
      }
    },

    // Resolves true only if the player earned the reward.
    async rewarded() {
      if (!provider || !state.canRequest) return false;
      let ok = false;
      if (provider === 'mock') ok = await mockAd('rewarded');
      else {
        if (!state.ready.rewarded) await preload('rewarded');
        if (!state.ready.rewarded) return false;
        state.ready.rewarded = false;
        try {
          const item = await AdMob.showRewardVideoAd();
          ok = !!item;
        } catch {
          ok = false;
        }
        preload('rewarded');
      }
      if (ok) state.lastRewarded = now();
      return ok;
    },

    holeFinished() {
      state.holesSinceInterstitial += 1;
    },

    async maybeInterstitial(reason) {
      if (!provider || !state.canRequest) return false;
      const s = {
        adsRemoved: progress.data.adsRemoved,
        lifetimeHoles: progress.data.stats.holes,
        lastInterstitial: state.lastInterstitial,
        lastRewarded: state.lastRewarded,
        holesSinceInterstitial: state.holesSinceInterstitial,
      };
      if (!shouldShowInterstitial(s, reason, now())) return false;
      if (provider === 'mock') await mockAd('interstitial');
      else {
        if (!state.ready.interstitial) return false; // never block play waiting for a load
        state.ready.interstitial = false;
        try {
          await AdMob.showInterstitial();
        } catch {}
        preload('interstitial');
      }
      state.lastInterstitial = now();
      state.holesSinceInterstitial = 0;
      return true;
    },
  };
  return ads;
}
