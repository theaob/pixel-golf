# Monetization design

Pixel Golf is free to play and earns money from ads. The design goal is
**ads that players choose**: most revenue comes from rewarded videos the player
opts into for something they want. Interstitials are rare and only appear at
natural breaks. Nothing blocks progress behind an ad, and everything you can get
from an ad can also be earned by playing.

## Why players watch ads

Coins are the core currency. Players earn them by playing and spend them on
**clubs**, which change how shots play, and **ball skins**, which are cosmetic
with trails. Clubs give ads real pull: a longer aim line, more power, or a
preview of the shot path through bounces are tangible advantages, especially on
the harder courses that unlock later.

| Club | Price | Perk |
| --- | --- | --- |
| Classic | free | standard |
| Longshot | 120 | 60% longer aim line |
| Bruiser | 200 | +20% power |
| Scout | 300 | aim line previews the real path through 1 bounce |
| Pro | 550 | previews 2 bounces, +10% power, longer line |
| Golden | 1000 | previews 3 bounces, +15% power, +25% coins |

Earning rates: a hole pays 2–6 coins, plus 10 for each star earned for the
first time and 15 for a hole-in-one. The daily hole pays 25–75 coins depending
on streak length, plus bonuses for beating par (+10) or a hole-in-one (+25),
and the daily gift pays 10–40. First-time star bonuses are the big source early
on (up to 1,260 coins across all 126 stars), so the cheaper clubs come quickly
and the Golden club is a longer goal. Every rewarded "double coins" view adds
the same amount again, so players who choose ads progress noticeably faster.
These numbers are starting points to tune with real data.

## Rewarded ads (opt-in)

| Placement | Where | Reward | Limit |
| --- | --- | --- | --- |
| **Double coins** | after every hole and after the daily hole | coins earned again | once per hole |
| **Mulligan** | HUD undo button, after a shot | retake the last shot (stroke and any water penalty removed) | once per hole |
| **Try a club** | Pro Shop, clubs tab | use any club for the next round | unlimited |
| **Save streak** | title screen, only after missing exactly one day | daily streak restored | once per missed day |
| **Free coins** | Pro Shop | +25 coins | 5 per day |

These placements line up with the moments a player most wants something:
just after a great hole (double), just after a bad shot (mulligan), when
browsing gear (try a club), and when about to lose a streak (save it). The
"try a club" ad also works as a demo for coin purchases.

## Interstitial ads (pacing rules)

Interstitials show only between holes or after a finished round, never during
play. The pacing rules live in `shouldShowInterstitial` in `src/ads.js` and are
unit tested in `tests/ads.test.js`:

- none until the player has finished **5 holes** in total (first impressions matter)
- at least **150 s** between interstitials
- none within **60 s** of a rewarded ad the player chose to watch
- between holes, at most every **3 holes**; at the end of a round, whenever the above allow
- if an ad isn't loaded yet, skip it rather than make the player wait

Tune these with real retention data. Interstitials earn per impression but cost
retention, and retention drives rewarded views, which earn more per view.

## Technical setup

- `src/ads.js` wraps **AdMob** via `@capacitor-community/admob`, which covers
  rewarded and interstitial ads plus Google's UMP consent flow.
- On launch the app asks for consent where the law requires it (EU/UK). A
  **Privacy options** button in the pause menu appears when Google says it's
  required.
- The web build shows no ads. Add `?ads=mock` to the URL (or run `npm run dev`)
  to get placeholder ads that exercise every flow.
- Ads currently use **Google's public test IDs**, so they're safe to click
  while developing.

## Go-live checklist

1. Create an AdMob account and app, plus one **rewarded** and one **interstitial** ad unit.
2. Replace the test IDs:
   - app ID: `android/app/src/main/res/values/strings.xml` (`admob_app_id`)
   - ad unit IDs: `AD_CONFIG` in `src/ads.js`; also set `testing: false`
3. Set up a GDPR consent message in AdMob (Privacy & messaging) so the consent form appears in the EU/UK.
4. Publish a privacy policy URL and fill in Google Play's **Data safety** form: the AdMob SDK collects the advertising ID and device data.
5. Add `app-ads.txt` to the developer website listed on the Play Store page.
6. Set the Play Console target audience. Pixel art can appeal to children; if
   under-13s are in the target audience, Families policy rules apply (only
   certified ad SDKs, child-directed ad requests). The simplest route is a
   13+ target age.

## Next steps

- **Remove Ads** in-app purchase (Google Play Billing): turns off interstitials
  and keeps optional rewarded ads. The flag `progress.data.adsRemoved` is already
  checked by the pacing rules.
- **Coin packs** as in-app purchases for players who'd rather pay than watch.
- **Analytics** events for ad offers shown, accepted and completed, per placement, to tune the economy.
- **Mediation** (AdMob mediation with other networks) to raise fill rate and eCPM once traffic grows.
