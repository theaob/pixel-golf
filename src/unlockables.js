// Cosmetic unlockables beyond balls and clubs, plus achievements ("awards").
// An item either has a coin `price` or is earned through an `award`.

// Ball trails. `match` uses the equipped ball's own trail colour.
export const TRAILS = [
  { id: 'match', name: 'MATCH BALL', price: 0 },
  { id: 'none', name: 'NO TRAIL', price: 0, colors: [] },
  { id: 'smoke', name: 'SMOKE', price: 120, colors: [0xd0d0d8, 0x9a9aa6], up: 0.5, gravity: -0.4, life: 0.6 },
  { id: 'confetti', name: 'CONFETTI', price: 200, colors: [0xff7aa2, 0xffd166, 0x5ec8ff, 0x7ef0c4], up: 0.8, life: 0.5, speed: 0.5 },
  { id: 'rainbow', name: 'RAINBOW', price: 260, rainbow: true, up: 0.3, life: 0.6 },
  { id: 'sparkle', name: 'SPARKLE', award: 'stars-50', colors: [0xffffff, 0xffe066], up: 0.9, life: 0.5, speed: 0.4 },
  { id: 'fire', name: 'FIRE', award: 'streak-7', colors: [0xff4f5e, 0xff9f1c, 0xffd166], up: 1.2, gravity: -1, life: 0.45 },
  { id: 'bubbles', name: 'BUBBLES', award: 'splash-20', colors: [0x9fe3ff, 0xffffff], up: 0.5, gravity: -0.6, life: 0.9 },
  { id: 'warp', name: 'WARP', award: 'portals-25', colors: [0x8f5bff, 0x2affd5], up: 0.4, life: 0.5 },
  { id: 'hearts', name: 'HEARTS', award: 'dailies-10', colors: [0xff8fc4, 0xff4f5e], up: 0.9, gravity: -0.5, life: 0.7 },
];

// Pixel-art pin flags, 12x8. `grid` letters map to `colors`; no grid = theme colour.
export const FLAGS = [
  { id: 'classic', name: 'CLASSIC', price: 0 },
  {
    id: 'heart', name: 'HEART', price: 120,
    colors: { P: 0xffb3d1, R: 0xff4f5e },
    grid: ['PPPPPPPPPPPP', 'PPPRRPPRRPPP', 'PPRRRRRRRRPP', 'PPRRRRRRRRPP', 'PPPRRRRRRPPP', 'PPPPRRRRPPPP', 'PPPPPRRPPPPP', 'PPPPPPPPPPPP'],
  },
  {
    id: 'ocean', name: 'OCEAN', price: 120,
    colors: { C: 0x9fe3ff, W: 0xffffff, B: 0x2a5fd6, D: 0x1d3f8a },
    grid: ['CCCCCCCCCCCC', 'CCCCCCCCCCCC', 'WCCCWCCCWCCC', 'BWCWBWCWBWCW', 'BBWBBBWBBBWB', 'BBBBBBBBBBBB', 'DDDDDDDDDDDD', 'DDDDDDDDDDDD'],
  },
  {
    id: 'pirate', name: 'PIRATE', price: 160,
    colors: { K: 0x1a1426, W: 0xffffff },
    grid: ['KKKKKKKKKKKK', 'KKKKWWWWKKKK', 'KKKWKWWKWKKK', 'KKKWWWWWWKKK', 'KKKKWKKWKKKK', 'KKWKKKKKKWKK', 'KKKWWKKWWKKK', 'KKKKKKKKKKKK'],
  },
  {
    id: 'rainbow', name: 'RAINBOW', price: 220,
    colors: { R: 0xff4f5e, O: 0xff9f1c, Y: 0xffd166, G: 0x6cc24a, C: 0x5ec8ff, B: 0x2a5fd6, P: 0x8f5bff },
    grid: ['RRRRRRRRRRRR', 'OOOOOOOOOOOO', 'YYYYYYYYYYYY', 'GGGGGGGGGGGG', 'CCCCCCCCCCCC', 'BBBBBBBBBBBB', 'PPPPPPPPPPPP', 'PPPPPPPPPPPP'],
  },
  {
    id: 'checkered', name: 'CHECKERED', award: 'under-par-round',
    colors: { K: 0x1a1426, W: 0xffffff },
    grid: ['KKWWKKWWKKWW', 'KKWWKKWWKKWW', 'WWKKWWKKWWKK', 'WWKKWWKKWWKK', 'KKWWKKWWKKWW', 'KKWWKKWWKKWW', 'WWKKWWKKWWKK', 'WWKKWWKKWWKK'],
  },
  {
    id: 'bird', name: 'BIRDIE', award: 'birdies-25',
    colors: { B: 0x5ec8ff, W: 0xffffff },
    grid: ['BBBBBBBBBBBB', 'BBBBBBBBBBBB', 'BBWWBBBBWWBB', 'BBBBWWWWBBBB', 'BBBBBWWBBBBB', 'BBBBBBBBBBBB', 'BBBBBBBBBBBB', 'BBBBBBBBBBBB'],
  },
  {
    id: 'swirl', name: 'DIZZY', award: 'spinners-25',
    colors: { P: 0x6b3fb0, C: 0x2affd5 },
    grid: ['PPPPPPPPPPPP', 'PCCCCCCCCCPP', 'PCPPPPPPPCPP', 'PCPCCCCCPCPP', 'PCPCPPPPPCPP', 'PCPCCCCCCCPP', 'PCPPPPPPPPPP', 'PCCCCCCCCCCP'],
  },
  {
    id: 'flame', name: 'FLAME', award: 'streak-30',
    colors: { K: 0x2a1a22, R: 0xff4f5e, O: 0xff9f1c, Y: 0xffd166 },
    grid: ['KKKKKKKKKKKK', 'KKKKKRKKKKKK', 'KKKKRRKKRKKK', 'KKKRROKRRKKK', 'KKRROORROKKK', 'KKROOYYOORKK', 'KKROYYYYORKK', 'KKKRRRRRRKKK'],
  },
  {
    id: 'crown', name: 'ROYAL', award: 'stars-all',
    colors: { P: 0x6b3fb0, G: 0xffc83d, R: 0xff4f5e },
    grid: ['PPPPPPPPPPPP', 'PPGPPGGPPGPP', 'PPGGPGGPGGPP', 'PPGGGGGGGGPP', 'PPGGGGGGGGPP', 'PPGRGGGGRGPP', 'PPPPPPPPPPPP', 'PPPPPPPPPPPP'],
  },
];

// What happens when the ball drops. `bursts`: [delay s, height, count, options].
export const CELEBRATIONS = [
  { id: 'confetti', name: 'CONFETTI', price: 0, colors: [0xff7aa2, 0xffd166, 0xffffff, 0x9b8cff, 0xff4f5e] },
  { id: 'hearts', name: 'LOVELY', price: 150, colors: [0xff8fc4, 0xff4f5e, 0xffffff], float: true },
  { id: 'stars', name: 'STARRY', price: 220, colors: [0xffd166, 0xffffff, 0xffe066] },
  { id: 'coins', name: 'JACKPOT', price: 320, colors: [0xffd166, 0xe0a83a, 0xfff3b0], fountain: true },
  { id: 'fireworks', name: 'FIREWORKS', award: 'ace', colors: [0xff4f5e, 0x5ec8ff, 0xffd166, 0x7ef0c4], fireworks: true },
  { id: 'gold', name: 'GRAND', award: 'all-courses', colors: [0xffc83d, 0xfff3b0, 0xffffff], fireworks: true, fountain: true },
];

// Achievements. `stat` reads a counter (see progress.js) or a computed value
// passed in `ctx`. Rewards: an item ({ cat, id }) and/or coins.
export const AWARDS = [
  { id: 'first-sink', name: 'OFF THE TEE', desc: 'FINISH YOUR FIRST HOLE', stat: 'holes', goal: 1, coins: 20 },
  { id: 'ace', name: 'ACE!', desc: 'GET A HOLE-IN-ONE', stat: 'aces', goal: 1, reward: { cat: 'fx', id: 'fireworks' } },
  { id: 'birdies-25', name: 'BIRDWATCHER', desc: 'FINISH 25 HOLES UNDER PAR', stat: 'underPar', goal: 25, reward: { cat: 'flags', id: 'bird' } },
  { id: 'under-par-round', name: 'SUB PAR', desc: 'FINISH A ROUND UNDER PAR', stat: 'roundsUnderPar', goal: 1, reward: { cat: 'flags', id: 'checkered' } },
  { id: 'holes-100', name: 'VETERAN', desc: 'FINISH 100 HOLES', stat: 'holes', goal: 100, reward: { cat: 'balls', id: 'veteran' } },
  { id: 'aces-10', name: 'ACE MACHINE', desc: 'GET 10 HOLES-IN-ONE', stat: 'aces', goal: 10, reward: { cat: 'balls', id: 'disco' } },
  { id: 'stars-50', name: 'STARGAZER', desc: 'COLLECT 50 STARS', stat: 'stars', goal: 50, reward: { cat: 'trails', id: 'sparkle' } },
  { id: 'stars-all', name: 'ALL THE STARS', desc: 'COLLECT EVERY STAR', stat: 'stars', goal: 'allStars', reward: { cat: 'flags', id: 'crown' }, coins: 500 },
  { id: 'streak-7', name: 'ON FIRE', desc: 'REACH A 7-DAY STREAK', stat: 'bestStreak', goal: 7, reward: { cat: 'trails', id: 'fire' } },
  { id: 'streak-30', name: 'UNSTOPPABLE', desc: 'REACH A 30-DAY STREAK', stat: 'bestStreak', goal: 30, reward: { cat: 'flags', id: 'flame' }, coins: 300 },
  { id: 'dailies-10', name: 'REGULAR', desc: 'PLAY 10 DAILY HOLES', stat: 'dailies', goal: 10, reward: { cat: 'trails', id: 'hearts' } },
  { id: 'bumpers-100', name: 'PINBALL WIZARD', desc: 'HIT BUMPERS 100 TIMES', stat: 'bumpers', goal: 100, reward: { cat: 'balls', id: 'chrome' } },
  { id: 'spinners-25', name: 'DIZZY', desc: 'GET HIT BY SPINNERS 25 TIMES', stat: 'spinners', goal: 25, reward: { cat: 'flags', id: 'swirl' } },
  { id: 'splash-20', name: 'SWIMMER', desc: 'FALL IN WATER OR LAVA 20 TIMES', stat: 'splashes', goal: 20, reward: { cat: 'trails', id: 'bubbles' } },
  { id: 'portals-25', name: 'WARP SPEED', desc: 'TRAVEL BY PORTAL 25 TIMES', stat: 'portals', goal: 25, reward: { cat: 'trails', id: 'warp' } },
  { id: 'all-courses', name: 'GRAND TOUR', desc: 'FINISH A ROUND ON EVERY COURSE', stat: 'coursesDone', goal: 'allCourses', reward: { cat: 'fx', id: 'gold' }, coins: 300 },
];

export const awardById = (id) => AWARDS.find((a) => a.id === id);
