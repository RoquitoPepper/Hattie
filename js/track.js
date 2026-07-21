// Procedural closed-loop race track.
// The centerline is generated as a polar curve r(theta) around a fixed
// center point, which guarantees a simple (non self-intersecting) closed
// shape, then smoothed with a Catmull-Rom spline and resampled at a fixed
// arc-length step so every other system can index into it uniformly.

const TRACK = (function buildTrack() {
  const CENTER = { x: 1300, y: 1000 };
  const R0 = 750;

  function radiusAt(theta) {
    return (
      R0 +
      150 * Math.sin(2 * theta + 0.5) +
      100 * Math.sin(3 * theta + 1.7) +
      60 * Math.sin(5 * theta + 3.0)
    );
  }

  const NUM_CTRL = 22;
  const ctrlPoints = [];
  for (let i = 0; i < NUM_CTRL; i++) {
    const theta = (i / NUM_CTRL) * Math.PI * 2;
    const r = radiusAt(theta);
    ctrlPoints.push({
      x: CENTER.x + Math.cos(theta) * r,
      y: CENTER.y + Math.sin(theta) * r,
    });
  }

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
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

  const WIDTH = 230;

  return {
    centerline,
    count,
    step: STEP,
    totalLength: total,
    width: WIDTH,
    bounds: { minX, minY, maxX, maxY },
  };
})();

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

function drawTrack(ctx) {
  const cl = TRACK.centerline;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cl[0].x, cl[0].y);
  for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Curb: white base, red dashes on top.
  ctx.setLineDash([]);
  ctx.lineWidth = TRACK.width + 26;
  ctx.strokeStyle = '#e8e8e8';
  ctx.stroke();

  ctx.setLineDash([42, 42]);
  ctx.lineWidth = TRACK.width + 26;
  ctx.strokeStyle = '#d13b3b';
  ctx.stroke();

  // Asphalt surface.
  ctx.setLineDash([]);
  ctx.lineWidth = TRACK.width;
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
  const half = TRACK.width / 2;
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
