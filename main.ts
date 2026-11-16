// SUPERNOVA PHOENIX — procedural entry for make.fun ai-excited-01 (Node 22, standard library only).
// Renders a 1024x1024 cosmic eruption scene into an RGB float buffer,
// tone-maps it, and encodes a PNG with adaptive per-row filters.
// Deterministic: fixed seed, no clocks, no randomness beyond the seeded PRNG.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024, H = 1024;

// ---------- seeded PRNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0xDA1517);

// ---------- value noise with fbm ----------
const PERM = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
function lattice(ix, iy) {
  return PERM[(PERM[ix & 255] + iy) & 255] / 255;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = lattice(ix, iy), b = lattice(ix + 1, iy);
  const c = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
  const u = smooth(fx), v = smooth(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f);
    norm += amp; amp *= 0.55; f *= 2.03;
  }
  return sum / norm;
}

// ---------- float framebuffer ----------
const buf = new Float32Array(W * H * 3);
function addPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] += r; buf[i + 1] += g; buf[i + 2] += b;
}
function setPx(x, y, r, g, b) {
  const i = (y * W + x) * 3;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
}
// soft round splat (star / spark / glow point)
function splat(cx, cy, radius, r, g, b, strength) {
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(H - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = (dx * dx + dy * dy) / (radius * radius);
      if (d2 >= 1) continue;
      const fall = Math.exp(-d2 * 4.5) * strength;
      addPx(x, y, r * fall, g * fall, b * fall);
    }
  }
}

// ---------- palette helpers ----------
function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function ramp(stops, t) {
  const n = stops.length - 1;
  const x = Math.min(0.999999, Math.max(0, t)) * n;
  const i = Math.floor(x);
  return mix3(stops[i], stops[i + 1], x - i);
}

// ---------- scene ----------
const CX = W * 0.5, CY = H * 0.44; // radiant core centre

// 1) Nebula background: domain-warped fbm clouds over deep space.
const nebPalette = [
  [0.012, 0.004, 0.045], // near-black violet
  [0.055, 0.016, 0.16],  // deep indigo
  [0.16, 0.03, 0.34],    // purple
  [0.42, 0.05, 0.38],    // magenta shadow
  [0.05, 0.22, 0.38],    // teal pocket (blended separately)
];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const nx = x / W, ny = y / H;
    const warp = fbm(nx * 3 + 11.7, ny * 3 + 4.2, 4);
    const cloud = fbm(nx * 5 + warp * 2.6, ny * 5 - warp * 1.9, 5);
    const cloud2 = fbm(nx * 9 - 3.1, ny * 9 + 8.4, 4);
    let t = Math.pow(Math.max(0, cloud * 1.25 - 0.18), 1.35);
    let col = ramp(nebPalette, Math.min(1, t * 1.15));
    // teal pockets where the second cloud peaks
    const teal = Math.pow(Math.max(0, cloud2 - 0.58), 1.6) * 2.4;
    col = mix3(col, [0.04, 0.5, 0.62], Math.min(0.75, teal));
    // darken towards the corners so the core owns the frame
    const dx = nx - 0.5, dy = ny - 0.46;
    const vig = 1 - Math.min(0.55, (dx * dx + dy * dy) * 0.9);
    setPx(x, y, col[0] * vig, col[1] * vig, col[2] * vig);
  }
}

// 2) Starfield: dim dust plus a few bright coloured stars with cross sparkle.
for (let i = 0; i < 1500; i++) {
  const x = rand() * W, y = rand() * H;
  const b = Math.pow(rand(), 2.6) * 0.5 + 0.03;
  addPx(x | 0, y | 0, b, b, b * 1.05);
}
const starTints = [[1, 0.85, 0.6], [0.65, 0.85, 1], [1, 0.6, 0.85], [1, 1, 1]];
for (let i = 0; i < 130; i++) {
  const x = rand() * W, y = rand() * H;
  const tint = starTints[(rand() * starTints.length) | 0];
  const s = 0.35 + rand() * 0.9;
  splat(x, y, 2.2 + rand() * 2.6, tint[0] * s, tint[1] * s, tint[2] * s, 0.8);
  if (rand() < 0.3) { // cross sparkle on the brightest
    const len = 6 + rand() * 9;
    for (let k = -len; k <= len; k++) {
      const f = (1 - Math.abs(k) / len) * 0.35 * s;
      addPx((x + k) | 0, y | 0, tint[0] * f, tint[1] * f, tint[2] * f);
      addPx(x | 0, (y + k) | 0, tint[0] * f, tint[1] * f, tint[2] * f);
    }
  }
}

// 3) Radiant core: layered glow, ray fan, white-gold heart.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - CX, dy = y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx);
    // broad halo
    const halo = Math.exp(-dist / 300) * 0.5;
    // rays: angular fan warped by noise so they feel organic
    const rayNoise = fbm(Math.cos(ang) * 2 + 7.3, Math.sin(ang) * 2 + 2.9, 3);
    const ray = Math.pow(Math.abs(Math.sin(ang * 9 + rayNoise * 5.5)), 7) * Math.exp(-dist / 340);
    const ray2 = Math.pow(Math.abs(Math.sin(ang * 23 - rayNoise * 3)), 13) * Math.exp(-dist / 210);
    // inner fireball with turbulent edge
    const turb = fbm(x / 90 + 31, y / 90 + 17, 4);
    const fire = Math.exp(-Math.max(0, dist - (turb - 0.5) * 60) / 95);
    const core = Math.exp(-dist / 46);
    let r = halo * 0.32 + ray * 0.36 + ray2 * 0.24 + fire * 1.05 + core * 1.9;
    let g = halo * 0.13 + ray * 0.16 + ray2 * 0.11 + fire * 0.5 + core * 1.6;
    let b = halo * 0.34 + ray * 0.2 + ray2 * 0.22 + fire * 0.12 + core * 1.05;
    // magenta fringe just outside the fireball
    const fringe = Math.exp(-Math.pow(dist - 118 - (turb - 0.5) * 46, 2) / (2 * 26 * 26));
    r += fringe * 0.5; g += fringe * 0.06; b += fringe * 0.55;
    const i = (y * W + x) * 3;
    buf[i] += r; buf[i + 1] += g; buf[i + 2] += b;
  }
}

// 4) Phoenix plumes: sweeping flame ribbons arcing out of the core.
// Each ribbon is a quadratic bezier sampled densely; width and hue drift
// from root (gold) to tip (magenta / cyan) and the whole ribbon glows.
function ribbon(p0, p1, p2, w0, hueA, hueB, strength) {
  const steps = 340;
  const phase = p0[0] * 0.37 + p0[1] * 0.53;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const mt = 1 - t;
    // flame sway: the path undulates more towards the tip, like real fire
    const swayX = Math.sin(t * 5.2 + phase) * 15 * t;
    const swayY = Math.cos(t * 4.1 + phase * 1.7) * 11 * t;
    const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0] + swayX;
    const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1] + swayY;
    const wdt = w0 * (1 - t * 0.82) * (0.75 + 0.25 * Math.sin(t * 21 + p0[0]));
    const col = mix3(hueA, hueB, t);
    const fade = Math.pow(1 - t, 0.65) * strength;
    // under-glow: a wide, dim halo pass so the ribbon sits in lit air
    splat(x, y, Math.max(2.5, wdt * 2.3), col[0], col[1], col[2], fade * 0.05);
    splat(x, y, Math.max(1.4, wdt), col[0], col[1], col[2], fade * 0.16);
  }
}
const GOLD = [1.0, 0.62, 0.16], MAGENTA = [1.0, 0.14, 0.62], CYAN = [0.2, 0.8, 1.0], VIOLET = [0.55, 0.2, 1.0];
// Wings: fans of thick feather ribbons sweeping up and out of the core,
// longest at the top of the fan, tips curling down — a rising phoenix span.
function wing(side) { // side: -1 left, +1 right
  const tips = [
    // [tipX, tipY, ctrlX, ctrlY, width, strength, tipHue]
    [492, -318, 300, -300, 26, 0.95, CYAN],
    [512, -215, 360, -235, 34, 1.05, MAGENTA],
    [508, -105, 390, -130, 40, 1.1, MAGENTA],
    [478, 6, 380, -20, 36, 1.0, VIOLET],
    [428, 116, 320, 84, 27, 0.9, VIOLET],
    [338, 208, 240, 168, 19, 0.8, MAGENTA],
  ];
  for (const [tx, ty, cx, cy, w, s, hue] of tips) {
    ribbon(
      [CX + side * 16, CY + 20],
      [CX + side * cx, CY + cy],
      [CX + side * tx, CY + ty],
      w, GOLD, hue, s
    );
  }
  // Secondary feathers: thinner, dimmer ribbons interleaved between the
  // primaries so the wing reads as layered plumage, not single streamers.
  const tips2 = [
    [502, -268, 330, -268, 13, 0.55, VIOLET],
    [515, -158, 378, -182, 15, 0.6, CYAN],
    [496, -48, 388, -72, 16, 0.62, MAGENTA],
    [452, 62, 352, 34, 13, 0.55, MAGENTA],
    [382, 164, 282, 128, 10, 0.5, CYAN],
  ];
  for (const [tx, ty, cx, cy, w, s, hue] of tips2) {
    ribbon(
      [CX + side * 10, CY + 26],
      [CX + side * cx, CY + cy],
      [CX + side * tx, CY + ty],
      w, GOLD, hue, s
    );
  }
}
wing(-1);
wing(1);
// crown flames straight up
ribbon([CX, CY - 10], [CX - 60, CY - 260], [CX - 30, CY - 430], 24, GOLD, MAGENTA, 0.95);
ribbon([CX + 6, CY - 12], [CX + 80, CY - 240], [CX + 60, CY - 410], 18, GOLD, CYAN, 0.8);
// tail streamers below
ribbon([CX - 8, CY + 40], [CX - 130, CY + 250], [CX - 90, CY + 440], 20, GOLD, VIOLET, 0.85);
ribbon([CX + 10, CY + 42], [CX + 120, CY + 260], [CX + 170, CY + 430], 17, GOLD, MAGENTA, 0.8);

// 5) Comet arcs crossing the lower sky, heads bright, tails fading.
function comet(x0, y0, x1, y1, bend, hueA, hueB) {
  const steps = 260;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + bend;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, mt = 1 - t;
    const x = mt * mt * x0 + 2 * mt * t * mx + t * t * x1;
    const y = mt * mt * y0 + 2 * mt * t * my + t * t * y1;
    const col = mix3(hueB, hueA, t);
    splat(x, y, 7 * t + 1, col[0], col[1], col[2], 0.05 + t * t * 0.16);
  }
  splat(x1, y1, 13, hueA[0], hueA[1], hueA[2], 1.15);
  splat(x1, y1, 4.5, 1.4, 1.4, 1.4, 1.2);
}
comet(60, 830, 400, 660, -60, CYAN, VIOLET);
comet(950, 870, 640, 690, -80, [1, 0.75, 0.3], MAGENTA);

// 6) Ember sparks drifting up from the core. Each spark is drawn as a
// short streak trailing behind its direction of travel — head bright,
// tail fading — so the field reads as moving fire, not static dust.
// Direction: mostly upward, fanned outward from the core.
function streak(x, y, dx, dy, len, rad, r, g, b, strength) {
  const steps = Math.max(2, Math.round(len / 1.6));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps; // 0 at the head, 1 at the tail
    const fade = Math.pow(1 - t, 1.6) * strength;
    splat(x - dx * len * t, y - dy * len * t, rad * (1 - t * 0.55),
      r, g, b, fade * 0.55);
  }
}
for (let i = 0; i < 540; i++) {
  const ang = rand() * Math.PI * 2;
  const dist = 40 + Math.pow(rand(), 1.6) * 380;
  const x = CX + Math.cos(ang) * dist * 1.15;
  const y = CY + Math.sin(ang) * dist * 0.92 - dist * 0.12;
  const warm = rand();
  const col = warm < 0.6 ? GOLD : (warm < 0.85 ? MAGENTA : CYAN);
  const s = 0.25 + rand() * 0.85;
  // velocity: up, tilted outward along the radial direction
  let vx = Math.cos(ang) * 0.45, vy = -1 + Math.sin(ang) * 0.3;
  const vl = Math.hypot(vx, vy); vx /= vl; vy /= vl;
  const len = 3 + rand() * 8 + dist * 0.012; // farther sparks fly faster
  streak(x, y, vx, vy, len, 1.3 + rand() * 1.6,
    col[0] * s, col[1] * s, col[2] * s, 0.95);
}
// Corona embers: a denser shell of sparks hugging the portal rim,
// thrown off the ring and drifting outward — the portal sheds fire.
// Their streaks point radially outward, like ejecta leaving the rim.
for (let i = 0; i < 300; i++) {
  const ang = rand() * Math.PI * 2;
  const dist = 150 + Math.pow(rand(), 1.35) * 130;
  const x = CX + Math.cos(ang) * dist;
  const y = CY + Math.sin(ang) * dist - rand() * 26; // slight upward drift
  const warm = rand();
  const col = warm < 0.55 ? GOLD : (warm < 0.85 ? [1.0, 0.45, 0.2] : MAGENTA);
  const s = 0.3 + rand() * 0.95;
  let vx = Math.cos(ang), vy = Math.sin(ang) - 0.35; // outward, tipped up
  const vl = Math.hypot(vx, vy); vx /= vl; vy /= vl;
  streak(x, y, vx, vy, 3 + rand() * 7, 1.2 + rand() * 1.6,
    col[0] * s, col[1] * s, col[2] * s, 1.0);
  if (rand() < 0.12) { // a few big soft cinders
    splat(x, y, 6 + rand() * 6, col[0], col[1], col[2], 0.16);
  }
}

// 7) Eclipse portal: a dark disc punched over the core with a blazing
// plasma ring — a bold graphic shape the whole scene organises around.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - CX, dy = y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const i = (y * W + x) * 3;
    // ring geometry first: the disc shoulder follows the wobbled rim
    const ang = Math.atan2(dy, dx);
    const wob = (fbm(Math.cos(ang) * 2.4 + 13.7, Math.sin(ang) * 2.4 + 6.1, 3) - 0.5) * 26;
    const ringR = 146 + wob;
    if (dist < ringR + 24) {
      // True eclipse: the interior falls to near-black so the core's ray
      // fan no longer bleeds through as a pinwheel; only a dim backlit
      // haze of scattered plasma light survives, hugging the rim.
      const t = Math.min(1, Math.max(0, (dist - (ringR - 20)) / 44));
      const dark = 0.018 + 0.982 * (t * t * (3 - 2 * t));
      buf[i] *= dark; buf[i + 1] *= dark; buf[i + 2] *= dark;
      if (dist < ringR) {
        const haze = Math.exp(-(ringR - dist) / 34);
        buf[i] += 0.17 * haze; buf[i + 1] += 0.035 * haze; buf[i + 2] += 0.11 * haze;
        // Deep interior: settle to a smooth void gradient. Multiplying
        // alone preserves a faint ghost of the core's ray fan; blending
        // to a purely radial colour destroys that structure while the
        // rim haze keeps the disc dimensional.
        const settle = Math.min(1, Math.max(0, (ringR - 14 - dist) / 40));
        const sw = settle * settle * (3 - 2 * settle);
        if (sw > 0) {
          buf[i] = buf[i] * (1 - sw) + (0.014 + 0.1 * haze) * sw;
          buf[i + 1] = buf[i + 1] * (1 - sw) + (0.006 + 0.02 * haze) * sw;
          buf[i + 2] = buf[i + 2] * (1 - sw) + (0.022 + 0.06 * haze) * sw;
        }
      }
    }
    // ring: fiery annulus, thickness and heat modulated by angle + noise
    const g = Math.exp(-Math.pow(dist - ringR, 2) / (2 * 13 * 13));
    const gWide = Math.exp(-Math.pow(dist - ringR, 2) / (2 * 34 * 34));
    const heat = 0.5 + 0.9 * fbm(ang * 3.1 + 40, dist / 55, 3);
    const col = ramp([[1.0, 0.3, 0.55], [1.0, 0.62, 0.16], [1.0, 0.88, 0.42], [0.95, 0.25, 0.7]], (ang + Math.PI) / (2 * Math.PI));
    buf[i] += (col[0] * g * 1.5 + col[0] * gWide * 0.3) * heat;
    buf[i + 1] += (col[1] * g * 1.5 + col[1] * gWide * 0.3) * heat;
    buf[i + 2] += (col[2] * g * 1.5 + col[2] * gWide * 0.3) * heat;
    // plasma filaments licking outward from the rim
    const fil = Math.pow(Math.max(0, fbm(ang * 6.3 + 90.2, 3.3, 3) - 0.52), 2) * 3.4;
    const filBand = Math.exp(-Math.pow(dist - (ringR + 30), 2) / (2 * 20 * 20));
    buf[i] += col[0] * fil * filBand * 0.85;
    buf[i + 1] += col[1] * fil * filBand * 0.85;
    buf[i + 2] += col[2] * fil * filBand * 0.85;
    // white-hot inner edge
    const inner = Math.exp(-Math.pow(dist - (ringR - 12), 2) / (2 * 5 * 5));
    buf[i] += inner * 0.55; buf[i + 1] += inner * 0.5; buf[i + 2] += inner * 0.42;
  }
}

// 7b) Prominence loops: arcs of plasma anchored on the rim at both feet,
// bulging outward and falling back — the portal's corona made visible.
// Each loop follows the ring's own wobble so its feet sit on the rim, and
// takes the ring's colour ramp at its mid-angle so it belongs to the ring.
function prominence(a0, a1, height, width, strength) {
  const steps = 130;
  const amid = (a0 + a1) / 2;
  const col = ramp([[1.0, 0.3, 0.55], [1.0, 0.62, 0.16], [1.0, 0.88, 0.42], [0.95, 0.25, 0.7]], (amid + Math.PI) / (2 * Math.PI));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const ang = a0 + (a1 - a0) * t;
    const wob = (fbm(Math.cos(ang) * 2.4 + 13.7, Math.sin(ang) * 2.4 + 6.1, 3) - 0.5) * 26;
    const r = 146 + wob + Math.sin(t * Math.PI) * height;
    const x = CX + Math.cos(ang) * r, y = CY + Math.sin(ang) * r;
    const fade = Math.pow(Math.sin(t * Math.PI), 0.4) * strength;
    splat(x, y, width * 2.3, col[0], col[1], col[2], fade * 0.05); // halo
    splat(x, y, width, col[0], col[1], col[2], fade * 0.2);        // body
    splat(x, y, width * 0.45, 1.2, 1.05, 0.85, fade * 0.22);       // hot spine
  }
}
prominence(-2.75, -2.05, 58, 5, 0.95);  // upper left
prominence(-1.95, -1.12, 96, 6, 1.05);  // the great crown loop, top
prominence(-0.95, -0.25, 64, 5, 0.95);  // upper right
prominence(0.15, 0.8, 46, 4.5, 0.85);   // right
prominence(2.35, 3.05, 50, 4.5, 0.85);  // lower left
prominence(1.25, 1.8, 40, 4, 0.75);     // lower right, small

// 8) Crystal ridge silhouette along the bottom, rim-lit from the core.
{
  const ridge = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const n = fbm(x / 130 + 3.7, 8.8, 4);
    const n2 = fbm(x / 34 + 9.1, 2.2, 3);
    ridge[x] = H - 60 - n * 150 - n2 * 46;
  }
  for (let x = 0; x < W; x++) {
    const top = Math.floor(ridge[x]);
    for (let y = top; y < H; y++) {
      const depth = (y - top) / Math.max(1, H - top);
      const i = (y * W + x) * 3;
      buf[i] *= 0.05 + depth * 0.05;
      buf[i + 1] *= 0.04 + depth * 0.04;
      buf[i + 2] *= 0.1 + depth * 0.06;
    }
    // rim light on the skyline edge
    for (let k = 0; k < 3; k++) {
      const y = top + k;
      if (y >= H) break;
      const i = (y * W + x) * 3;
      const f = (1 - k / 3) * 0.55;
      buf[i] += 1.0 * f; buf[i + 1] += 0.42 * f; buf[i + 2] += 0.62 * f;
    }
  }
  // Nearer ridge: a second, lower silhouette in front of the first,
  // crushed almost to black with only a cool violet kiss of rim light —
  // the parallax gap between the two skylines gives the shore depth.
  for (let x = 0; x < W; x++) {
    const n = fbm(x / 210 + 17.3, 4.4, 3);
    const n2 = fbm(x / 52 + 1.9, 7.7, 2);
    const top = Math.floor(H - 14 - n * 58 - n2 * 20);
    for (let y = top; y < H; y++) {
      const i = (y * W + x) * 3;
      buf[i] *= 0.1; buf[i + 1] *= 0.1; buf[i + 2] *= 0.13;
    }
    for (let k = 0; k < 2; k++) {
      const y = top + k;
      if (y >= H) break;
      const i = (y * W + x) * 3;
      const f = (1 - k / 2) * 0.16;
      buf[i] += 0.3 * f; buf[i + 1] += 0.34 * f; buf[i + 2] += 0.6 * f;
    }
  }
}

// ---------- tone map + encode ----------
const img = new Uint8Array(W * H * 3);
for (let p = 0; p < W * H; p++) {
  const px = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let v = buf[p * 3 + c];
    v = v / (1 + v * 0.55);              // soft shoulder
    v = Math.pow(Math.max(0, v), 0.78);  // lift
    // gentle S-curve blended in: deepens the shadows so the nebula
    // falls off to true space-black instead of washed violet
    px[c] = v * (1 - 0.32) + (v * v * (3 - 2 * v)) * 0.32;
  }
  // final vignette: pull the corners down so the portal owns the eye
  const vx = (p % W) / W - 0.5, vy = Math.floor(p / W) / H - 0.46;
  const vd = Math.min(1, (vx * vx + vy * vy) * 2.1);
  const vigF = 1 - 0.3 * (vd * vd * (3 - 2 * vd));
  const luma = px[0] * 0.299 + px[1] * 0.587 + px[2] * 0.114;
  for (let c = 0; c < 3; c++) {
    const v = (luma + (px[c] - luma) * 1.32) * vigF; // saturation push
    img[p * 3 + c] = Math.min(255, Math.max(0, Math.round(v * 255)));
  }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
// adaptive per-row filters: try None/Sub/Up/Average/Paeth, keep the row
// whose filtered bytes have the smallest sum of absolute signed values.
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
}
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const rowOff = y * W * 3;
  let best = null, bestScore = Infinity, bestType = 0;
  for (let type = 0; type <= 4; type++) {
    const cand = Buffer.alloc(W * 3);
    let score = 0;
    for (let i = 0; i < W * 3; i++) {
      const cur = img[rowOff + i];
      const left = i >= 3 ? img[rowOff + i - 3] : 0;
      const up = y > 0 ? img[rowOff - W * 3 + i] : 0;
      const upLeft = (y > 0 && i >= 3) ? img[rowOff - W * 3 + i - 3] : 0;
      let pred = 0;
      if (type === 1) pred = left;
      else if (type === 2) pred = up;
      else if (type === 3) pred = (left + up) >> 1;
      else if (type === 4) pred = paeth(left, up, upLeft);
      const v = (cur - pred) & 255;
      cand[i] = v;
      score += v < 128 ? v : 256 - v;
    }
    if (score < bestScore) { bestScore = score; best = cand; bestType = type; }
  }
  raw[y * (1 + W * 3)] = bestType;
  best.copy(raw, y * (1 + W * 3) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
