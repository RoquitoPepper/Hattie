// Procedural closed-loop race tracks, one per level (1..LEVEL_COUNT).
// The centerline is generated as a polar curve r(theta) around a fixed
// center point, which guarantees a simple (non self-intersecting) closed
// shape, then smoothed with a Catmull-Rom spline and resampled at a fixed
// arc-length step so every other system can index into it uniformly.
//
// Each level is seeded deterministically from its number, so the same
// level always produces the same track, and difficulty (tightness of the
// corners and track width) scales smoothly from level 1 (easiest) to
// LEVEL_COUNT (hardest).

const LEVEL_COUNT = 100;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function difficultyOf(level) {
  return clamp((level - 1) / (LEVEL_COUNT - 1), 0, 1);
}

function generateTrack(level) {
  const t = difficultyOf(level);
  const rng = mulberry32(level * 7919 + 13);

  const CENTER = { x: 1300, y: 1000 };
  const R0 = 750;

  // Harder levels get tighter, twistier corners: amplitude of the polar
  // wobble grows with difficulty, while staying well short of R0 so the
  // curve can never fold back on itself.
  const ampScale = 0.5 + 0.95 * t;
  const amps = [150 * ampScale, 100 * ampScale, 60 * ampScale, 45 * t * ampScale];
  const freqs = [2, 3, 5, 7];
  const phases = amps.map(() => rng() * Math.PI * 2);

  function radiusAt(theta) {
    let r = R0;
    for (let i = 0; i < amps.length; i++) {
      r += amps[i] * Math.sin(freqs[i] * theta + phases[i]);
    }
    return r;
  }

  // More control points on harder levels = more distinct corners.
  const NUM_CTRL = Math.round(16 + 12 * t);
  const ctrlPoints = [];
  for (let i = 0; i < NUM_CTRL; i++) {
    const theta = (i / NUM_CTRL) * Math.PI * 2;
    const r = radiusAt(theta);
    ctrlPoints.push({
      x: CENTER.x + Math.cos(theta) * r,
      y: CENTER.y + Math.sin(theta) * r,
    });
  }

  function catmullRom(p0, p1, p2, p3, u) {
    const u2 = u * u;
    const u3 = u2 * u;
    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * u +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * u +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);
    return { x, y };
  }

  // Densely sample the spline around the loop.
  const SEG_SAMPLES = 40;
  const n = ctrlPoints.length;
  const fine = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrlPoints[(i - 1 + n) % n];
    const p1 = ctrlPoints[i];
    const p2 = ctrlPoints[(i + 1) % n];
    const p3 = ctrlPoints[(i + 2) % n];
    for (let s = 0; s < SEG_SAMPLES; s++) {
      fine.push(catmullRom(p0, p1, p2, p3, s / SEG_SAMPLES));
    }
  }

  // Cumulative arc length around the fine sample loop.
  let total = 0;
  const cum = [0];
  for (let i = 1; i <= fine.length; i++) {
    const a = fine[i - 1];
    const b = fine[i % fine.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cum.push(total);
  }

  // Resample at a uniform arc-length step so every centerline index
  // represents (roughly) the same distance travelled.
  const STEP = 8;
  const centerline = [];
  let seg = 0;
  for (let d = 0; d < total; d += STEP) {
    while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
    const segStart = cum[seg];
    const segEnd = cum[seg + 1];
    const segT = segEnd > segStart ? (d - segStart) / (segEnd - segStart) : 0;
    const a = fine[seg % fine.length];
    const b = fine[(seg + 1) % fine.length];
    centerline.push({
      x: a.x + (b.x - a.x) * segT,
      y: a.y + (b.y - a.y) * segT,
    });
  }

  const count = centerline.length;
  for (let i = 0; i < count; i++) {
    const a = centerline[i];
    const b = centerline[(i + 1) % count];
    a.angle = Math.atan2(b.y - a.y, b.x - a.x);
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of centerline) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Wide and forgiving on level 1, narrow and technical by level 100.
  const WIDTH = 300 - 140 * t;

  return {
    level,
    difficulty: t,
    centerline,
    count,
    step: STEP,
    totalLength: total,
    width: WIDTH,
    bounds: { minX, minY, maxX, maxY },
  };
}

let TRACK = generateTrack(1);

// Local windowed nearest-point search along the centerline, starting from a
// hint index so it stays cheap even with a few hundred bikes-worth of calls.
function trackFindNearest(pos, hintIndex) {
  const cl = TRACK.centerline;
  const n = cl.length;
  const WINDOW = 90;
  let best = -1;
  let bestD = Infinity;
  for (let k = -WINDOW; k <= WINDOW; k++) {
    const i = ((hintIndex + k) % n + n) % n;
    const p = cl[i];
    const dx = p.x - pos.x;
    const dy = p.y - pos.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, dist: Math.sqrt(bestD) };
}

function trackFindNearestFull(pos) {
  const cl = TRACK.centerline;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < cl.length; i++) {
    const p = cl[i];
    const dx = p.x - pos.x;
    const dy = p.y - pos.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, dist: Math.sqrt(bestD) };
}

function drawTrack(ctx, track) {
  track = track || TRACK;
  const cl = track.centerline;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cl[0].x, cl[0].y);
  for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Curb: white base, red dashes on top.
  ctx.setLineDash([]);
  ctx.lineWidth = track.width + 26;
  ctx.strokeStyle = '#e8e8e8';
  ctx.stroke();

  ctx.setLineDash([42, 42]);
  ctx.lineWidth = track.width + 26;
  ctx.strokeStyle = '#d13b3b';
  ctx.stroke();

  // Asphalt surface.
  ctx.setLineDash([]);
  ctx.lineWidth = track.width;
  ctx.strokeStyle = '#4a4f57';
  ctx.stroke();

  // Centerline dashes.
  ctx.lineWidth = 6;
  ctx.setLineDash([28, 30]);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Start / finish line.
  const start = cl[0];
  const angle = start.angle;
  const nx = Math.cos(angle + Math.PI / 2);
  const ny = Math.sin(angle + Math.PI / 2);
  const half = track.width / 2;
  const checks = 8;
  const segLen = (half * 2) / checks;
  ctx.save();
  for (let i = 0; i < checks; i++) {
    const t0 = -half + i * segLen;
    const t1 = t0 + segLen;
    ctx.fillStyle = i % 2 === 0 ? '#f2f2f2' : '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(start.x + nx * t0 - Math.cos(angle) * 8, start.y + ny * t0 - Math.sin(angle) * 8);
    ctx.lineTo(start.x + nx * t1 - Math.cos(angle) * 8, start.y + ny * t1 - Math.sin(angle) * 8);
    ctx.lineTo(start.x + nx * t1 + Math.cos(angle) * 8, start.y + ny * t1 + Math.sin(angle) * 8);
    ctx.lineTo(start.x + nx * t0 + Math.cos(angle) * 8, start.y + ny * t0 + Math.sin(angle) * 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
