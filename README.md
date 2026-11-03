# Armchair Football (CFL revival), v1

A web emulation of the 1985 Canadian Armchair Football dice game. It is plain HTML, CSS and JavaScript with no build step, framework, backend, CDN or external fonts. It works offline and straight from `file://`.

## Run it
- **Locally:** open `index.html` in any browser.
- **Hosted:** copy the folder to any static host, such as GitHub Pages, Netlify or S3.

## Files
- `index.html`: the screens and overlays
- `css/style.css`: layout (phone portrait first; three columns from 900 px wide)
- `js/teams.js`: the 9 teams, their colours, and a helmet drawn in code with an original emblem for each nickname (lion, horse, elk antlers, wheat, bomber, tiger stripes, lark, split shield, sailing ship). These are new designs, not CFL or team trademarks.
- `js/engine.js`: the rules (dice tables, downs, scoring, kicking, clock, overtime, stats). It has no DOM code.
- `js/ai.js`: computer play calling
- `js/ui.js`: rendering, dice animation, pass-and-play hand-over, localStorage save/resume/history
- `tests/`: acceptance tests

## Tests
```
node tests/engine.test.js      # rules + computer opponent, scripted dice (88 checks)
node tests/ui.test.js [outdir] # headless Chromium: full solo + pass-and-play games, save/resume, 6 device layouts
node tests/art.test.js [outdir] # custom helmet art: upload, persist, remove
```
Add `?fast=1` to the URL to skip animations (the browser tests use it).

## Interpretations of the brief
These are places where the brief left room, and the build makes a deliberate choice:
1. **Stopped clock.** The listed per-play times are treated as running-clock times, since they include the huddle. When the clock is stopped before the snap (after a timeout, or anywhere in the last 3 minutes of a half), a run, completion or sack burns 10 s instead of 35 s or 30 s. Kneel always burns 40 s. Without this rule, timeouts and "clock stops after every play" would do nothing.
2. **3-minute warning.** A play that would run through 3:00 ends with the clock at exactly 3:00, and the warning fires there.
3. **End zone.** A punt landing at or beyond the goal line counts as "in the end zone" for the rouge rule.
4. **Fumble in the end zone.** If a punt or missed field goal is fumbled on the return (roll of 2) and the catch spot is in the end zone, the kicking team recovers there. That is a touchdown.
5. **Overtime.** The team that kicked off to open the game goes first in each round. There are no punts in overtime, and a convert is still taken after an overtime touchdown.
6. **Timeouts.** Only the offence calls them, and only while the clock is running. The computer does not use timeouts.
7. **Computer additions.** These go beyond the brief's rules. With 40 s or less left in a half and the ball in range (50 yds or less), the computer kicks a field goal (in Q4 only when tied or down by 3 or fewer). It kneels only when leading in the last minute, and never on its own 1.
8. **Field ends.** The home team always defends the bottom end zone, and the teams do not switch ends.
9. **Team colours.** The brief's hex values are used as given. I couldn't find an authoritative official source to check them against.

## Adding your own helmet logos (Custom Helmet Art)
The app ships with original drawn emblems. To use real team logos for your own games, save the images yourself and load them in the app.

**1. Get the images.** Save one image per team, for example from each team's official website, its Wikipedia page, or an image search for "<team> logo png".
- Desktop: right-click the logo and choose *Save image as…*
- iPhone: press and hold the logo and choose *Save to Photos* (or *Save to Files*).
- Android: press and hold the logo and choose *Download image*.

**2. What works best.** Use a PNG with a transparent background, around 300–600 px wide. JPG, WebP and SVG also load. The app shrinks every image to 320 px and stores it as PNG, so large files are fine.

**3. Load them.** On the start screen tap **Custom Helmet Art** (in a game it's in the ☰ menu). Next to each team tap **Choose image** and pick the file, or the photo on a phone. Then choose:
- **On helmet** puts your logo on the side of the drawn helmet.
- **Whole helmet** replaces the drawn helmet with your picture. Use this if you saved a picture of the actual helmet.

Tap **Remove** to go back to the drawn emblem.

**Where they're stored.** Your images live only in that browser's local storage on that device. They are not part of these files or the GitHub repo, so publishing the app never publishes the logos. Each device and browser needs its own upload. Clearing site data removes them.
