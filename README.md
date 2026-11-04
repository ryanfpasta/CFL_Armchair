# Armchair Football (CFL revival), v1

A web emulation of the 1985 Canadian Armchair Football dice game. It is plain HTML, CSS and JavaScript with no build step, framework, backend, CDN or external fonts. It works offline and straight from `file://`.

## Run it
- **Locally:** open `index.html` in any browser.
- **Hosted:** copy the folder to any static host, such as GitHub Pages, Netlify or S3.

## Files
- `index.html`: the screens and overlays
- `css/style.css`: layout (phone portrait first; three columns from 900 px wide)
- `js/logos.js`: the owner's team logo images, used as the default helmet art (personal, non-commercial use)
- `js/teams.js`: the 9 teams, their colours, and a helmet drawn in code with an original emblem for each nickname (lion, horse, elk antlers, wheat, bomber, tiger stripes, lark, split shield, sailing ship). These are new designs, not CFL or team trademarks.
- `js/engine.js`: the rules (dice tables, downs, scoring, kicking, clock, overtime, stats). It has no DOM code.
- `js/ai.js`: computer play calling
- `js/season.js`: season mode rules (schedule, standings, tiebreakers, crossover, playoffs, Grey Cup). It has no DOM code.
- `js/ui.js`: rendering, dice animation, pass-and-play hand-over, season screens, localStorage save/resume/history
- `tests/`: acceptance tests

## Tests
```
node tests/engine.test.js      # rules + computer opponent, scripted dice (88 checks)
node tests/ui.test.js [outdir] # headless Chromium: full solo + pass-and-play games, save/resume, 6 device layouts
node tests/art.test.js [outdir] # custom helmet art: upload, persist, remove
node tests/season.test.js      # season logic: 200 schedules, standings, tiebreakers, crossover, 40 simulated seasons
node tests/season-ui.test.js [outdir] # headless Chromium: a season from team pick to the Grey Cup
```
Add `?fast=1` to the URL to skip animations (the browser tests use it).

## Season mode
Pick a team and play an 18-game season over 21 weeks, then the playoffs and the Grey Cup.
- **Divisions:** West is BC, Calgary, Edmonton, Saskatchewan and Winnipeg. East is Hamilton, Montreal, Ottawa and Toronto.
- **Schedule:** every team plays every other team home and away (16 games), plus one more home and one more away game against division rivals. With nine teams, each team has three bye weeks. No team meets the same opponent in back-to-back weeks.
- **Each week:** play your game, or sim it. Every other game is a full computer-vs-computer game with the same dice tables and play calling.
- **Standings:** 2 points for a win. Ties in the standings go to wins, then head-to-head points, head-to-head point differential, division-game differential, overall differential, and finally a coin flip.
- **Playoffs:** top three in each division. 2nd hosts 3rd in the semi-final, and 1st has a bye and hosts the final. **Crossover:** if the 4th-place team in one division has more points than the 3rd-place team in the other (a tie is not enough), it takes that spot in the other division's bracket. The Grey Cup is at a neutral site that changes each season.
- **Playoff banners:** playoff games show a banner over the scoreboard and the round painted at midfield. The Grey Cup gets a gold banner with the trophy, and the winner gets a celebration with confetti and a fanfare.
- **Saving:** the season saves in the browser after every play, separately from single games, so a single game never overwrites it.

## Onside kick
An onside kick is available on any kickoff in the last 3 minutes of the 2nd or 4th quarter. The kicking team recovers it on 2d6 of 11 or more (1 in 12) and gets the ball at its own 45. Otherwise the receiving team takes over at the kicking team's 45. The computer tries an onside kick when it's trailing in the 4th quarter with 2 minutes or less left, or when it's down by more than 8 with 3 minutes or less left.

## Fake punt and fake field goal
Trick plays for 3rd down, under **Trick play** below the play buttons. Big risk, big reward: they fool the defence on 2d6 of 8 or more (5 in 12).
- **Fake Punt** (the punter runs, any 3rd down except in overtime): 2 fumble, lost at the line · 3 −3 · 4 −1 · 5 no gain · 6 +1 · 7 +2 · 8 +12 · 9 +15 · 10 +20 · 11 +30 · 12 TOUCHDOWN.
- **Fake Field Goal** (the holder throws, 3rd down in field-goal range): 2 intercepted · 3 sacked −4 · 4 sacked −2 · 5–7 incomplete · 8 +10 · 9 +14 · 10 +18 · 11 +25 · 12 TOUCHDOWN.
- If it comes up short of the first down, it's a turnover on downs at the spot, so a failed fake punt hands the other team great field position, and a failed fake field goal gives up the points.
- The computer fakes a punt when it's down by more than 8 in the last 3 minutes (on 3rd and 12 or less), and a fake field goal 30% of the time when it's down by more than 3 late in range. It also tries the odd surprise: about 6% of the time on 3rd and 4 or less between its own 45 and your 35 (never protecting a 4th-quarter lead), and 5% of the time on 3rd and 3 or less in field-goal range before the last 3 minutes.

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
