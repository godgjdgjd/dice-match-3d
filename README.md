# Dice Match 🎲

A small mobile puzzle game **inspired by** PlayStation's *Devil Dice* (it is an
original work — no original assets, characters, or music are used).

Roll dice around the board; rolling changes the top face. When a connected group
of dice all show the same number **N** and the group has **N** dice, they vanish.
Reach the goal to advance — up to 100 levels.

- **No assets, no build step** — all graphics are drawn with HTML/CSS.
- **Touch + mouse + keyboard** controls.
- **Android & iOS ready** via [Capacitor](https://capacitorjs.com/).

---

## ▶️ Play right now (web)

The game is plain HTML/CSS/JS in `www/`. Either:

```bash
# option A: just open it
open www/index.html        # macOS
xdg-open www/index.html    # Linux

# option B: serve it (better for phones on your Wi-Fi)
npx serve www
```

Then on your phone's browser open `http://<your-computer-ip>:3000`.

### Controls
- **Swipe** a die to roll it into an empty neighbor.
- Or **tap** a die to select it, then use the on-screen arrow pad.
- Desktop: arrow keys move the selected die.

---

## 📱 Turn it into a real Android / iOS app (Capacitor)

This wraps the exact same web game into native app projects you build in
Android Studio / Xcode.

```bash
# 1. install dependencies
npm install

# 2. initialize native projects (config is already in capacitor.config.json)
npx cap add android      # needs Android Studio + JDK
npx cap add ios          # needs a Mac with Xcode

# 3. copy the web app into the native projects
npx cap sync

# 4. open in the native IDE, then Run on a device/emulator
npx cap open android
npx cap open ios
```

**Requirements**
- Android build: [Android Studio](https://developer.android.com/studio) + JDK 17.
- iOS build: a **Mac** with Xcode (Apple requirement — can't build iOS elsewhere).

After any change to files in `www/`, run `npx cap sync` again before rebuilding.

---

## 🗂️ Project layout

```
game/
├─ www/                 # the actual game (this is what ships)
│  ├─ index.html
│  ├─ style.css
│  └─ game.js           # engine: dice rolling, matching, levels
├─ capacitor.config.json
├─ package.json
└─ README.md
```

## 🧩 How levels work (and how to scale to 100)

Right now levels are **generated**: each level fills ~60% of the board with
dice (weighted toward low numbers so matches are achievable) and sets a clear
goal that grows with the level. There is no "unsolvable level" problem because
clearing is score-based, not "clear everything."

The natural next step (discussed with the designer) is a real **solver** —
a search that verifies a layout is clearable and rates its difficulty — so we
can pre-generate 100 hand-feeling, guaranteed-solvable puzzles. That's a
future enhancement, not in this sample.

## Notes / next ideas
- Sound effects + music (free, commercially-licensed assets).
- Nicer art (replace CSS dice with sprites — Kenney.nl etc.).
- The signature *Devil Dice* feel: a character that climbs and rolls dice.
- Solver-backed handcrafted 100-level campaign.
