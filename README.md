[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/blupoint44/supernova-phoenix/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/blupoint44/supernova-phoenix/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

# Supernova Phoenix — ai-excited-01 entry

A self-contained Node program (standard library only, no dependencies, no
network) that procedurally renders one 1024×1024 image — **Supernova
Phoenix** — and writes it to `/output/entry.png` (or
`$MAKEFUN_OUTPUT_DIR/entry.png` outside the grader).

Run: `node main.ts`

Fully deterministic (fixed seed `0xDA1517`): two runs write identical
bytes. A single render takes well under a minute.

## The artwork

At the centre of the frame hangs an **eclipse portal**: a true-black disc
whose interior settles into a smooth void, ringed by a blazing plasma
annulus. The ring's heat and colour cycle gold → magenta around its
circumference, a white-hot inner edge lines the rim, and noise-driven
plasma filaments lick outward into space. Great prominence loops — arcs
of plasma anchored on the rim at both feet, bulging outward and falling
back, the tallest crowning the top of the disc — make the corona
visible. A shell of corona embers is
thrown off the rim, each spark drawn as a short streak trailing behind
its outward flight.

Erupting from behind the portal are the **phoenix plumes**: two symmetric
wings, each a fan of thick primary feather ribbons interleaved with
thinner secondary feathers. Every ribbon follows a swaying quadratic
curve — flame-like undulation that grows toward the tip — and its colour
drifts along its length from gold at the root to magenta, violet or cyan
at the tip. Two crown flames rise straight up from the core and two tail
streamers fall below it.

The scene is layered back to front:

1. **Nebula** — domain-warped fractal noise clouds in indigo, purple and
   magenta with teal pockets, darkened toward the corners.
2. **Starfield** — dim dust plus brighter tinted stars, the brightest
   carrying cross sparkles.
3. **Radiant core** — a layered glow with an organic, noise-warped ray
   fan, a turbulent fireball and a magenta fringe; the portal disc later
   punches through its heart.
4. **Phoenix plumes** — the wing, crown and tail ribbons described above.
5. **Comets** — two arcs crossing the lower sky, bright heads, fading tails.
6. **Embers** — hundreds of rising sparks around the core plus the corona
   shell at the rim, all drawn as motion streaks.
7. **Eclipse portal** — the black disc, plasma ring and filaments, then
   the prominence loops arcing off the rim.
8. **Crystal ridge** — two silhouetted skylines along the bottom (a
   rim-lit main ridge and a nearer, darker one in front) whose parallax
   gap grounds the scene.

Everything is rendered into a float framebuffer with additive glow, then
tone-mapped (soft shoulder, lift, a gentle S-curve that deepens shadows
to true space-black), saturation-pushed, vignetted, and encoded as a PNG
with adaptive per-row filtering chosen per row for the smallest output.
