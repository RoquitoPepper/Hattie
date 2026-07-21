(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');

  const hud = document.getElementById('hud');
  const menu = document.getElementById('menu');
  const results = document.getElementById('results');
  const countdownEl = document.getElementById('countdown');
  const countdownText = document.getElementById('countdownText');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const muteBtn = document.getElementById('muteBtn');

  const lapCurrentEl = document.getElementById('lapCurrent');
  const positionEl = document.getElementById('position');
  const positionSuffixEl = document.getElementById('positionSuffix');
  const raceTimeEl = document.getElementById('raceTime');
  const speedValueEl = document.getElementById('speedValue');

  const RIDER_NAMES = ['You', 'Razor', 'Vex', 'Ghost', 'Ripper'];
  const RIDER_COLORS = ['#ffd23f', '#ff5f5f', '#4fc3f7', '#69f0ae', '#ba68c8'];

  const STATE = { MENU: 'menu', COUNTDOWN: 'countdown', RACING: 'racing', FINISHED: 'finished' };
  let state = STATE.MENU;

  let bikes = [];
  let player = null;
  let raceTime = 0;
  let countdownValue = 3;
  let countdownTimer = 0;
  let lastFrame = null;
  let zoom = 0.62;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function spawnBikes() {
    const list = [];
    const n = TRACK.count;
    for (let i = 0; i < RIDER_NAMES.length; i++) {
      const backIdx = ((0 - i * 34) % n + n) % n;
      const p = TRACK.centerline[backIdx];
      const laneSign = i % 2 === 0 ? 1 : -1;
      const laneOffset = laneSign * (TRACK.width * 0.22);
      const nx = Math.cos(p.angle + Math.PI / 2);
      const ny = Math.sin(p.angle + Math.PI / 2);
      list.push(
        new Bike({
          name: RIDER_NAMES[i],
          color: RIDER_COLORS[i],
          isPlayer: i === 0,
          x: p.x + nx * laneOffset,
          y: p.y + ny * laneOffset,
          angle: p.angle,
          maxSpeed: 600 + (i === 0 ? 40 : Math.random() * 60 - 10),
          accel: 380 + Math.random() * 60,
          turnRate: 2.6 + Math.random() * 0.3,
          startOffset: -(i * 34),
        })
      );
    }
    return list;
  }

  function rankBikes() {
    const sorted = [...bikes].sort((a, b) => b.totalProgress - a.totalProgress);
    sorted.forEach((b, i) => (b.position = i + 1));
    return sorted;
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  }

  function startRace() {
    bikes = spawnBikes();
    player = bikes[0];
    raceTime = 0;
    countdownValue = 3;
    countdownTimer = 0;
    state = STATE.COUNTDOWN;
    menu.classList.add('hidden');
    results.classList.add('hidden');
    hud.classList.remove('hidden');
    countdownEl.classList.remove('hidden');
    countdownText.textContent = countdownValue;
    GameAudio.ensureContext();
    GameAudio.startEngine();
    GameAudio.countdownBeep(3);
  }

  function finishRace() {
    state = STATE.FINISHED;
    GameAudio.stopEngine();
    GameAudio.finishJingle();
    hud.classList.add('hidden');
    const sorted = rankBikes();
    // Anyone who didn't cross the line gets ranked by progress but no time.
    sorted.forEach((b, i) => {
      if (!b.finishPosition) b.finishPosition = i + 1;
    });
    const tbody = document.querySelector('#resultsTable tbody');
    tbody.innerHTML = '';
    sorted.forEach((b, i) => {
      const tr = document.createElement('tr');
      if (b.isPlayer) tr.classList.add('you');
      const best = b.bestLap();
      tr.innerHTML = `<td>${i + 1}</td><td>${b.name}</td><td>${
        b.finishTime != null ? formatTime(b.finishTime) : '—'
      }</td><td>${best != null ? formatTime(best) : '—'}</td>`;
      tbody.appendChild(tr);
    });
    results.classList.remove('hidden');
  }

  function update(dt) {
    if (state === STATE.COUNTDOWN) {
      countdownTimer += dt;
      if (countdownTimer >= 1) {
        countdownTimer -= 1;
        countdownValue -= 1;
        if (countdownValue <= 0) {
          countdownText.textContent = 'GO!';
          GameAudio.countdownBeep(0);
          state = STATE.RACING;
          setTimeout(() => countdownEl.classList.add('hidden'), 500);
        } else {
          countdownText.textContent = countdownValue;
          GameAudio.countdownBeep(countdownValue);
        }
      }
      return;
    }

    if (state !== STATE.RACING) return;

    raceTime += dt;
    const controls = Input.getControls();

    for (const b of bikes) {
      if (b.finished) continue;
      // Rubber-band AI speed toward the player's pace so the race stays close.
      if (!b.isPlayer) {
        const diff = player.totalProgress - b.totalProgress;
        const adjust = clamp(diff * 0.035, -90, 130);
        b.maxSpeed = clamp(b.baseMaxSpeed + adjust, b.baseMaxSpeed * 0.65, b.baseMaxSpeed * 1.3);
      }
      b.update(dt, raceTime, controls);
    }

    rankBikes();
    if (player.finished && !player.finishPosition) {
      player.finishPosition = bikes.filter((b) => b.finished && b.finishTime <= player.finishTime).length;
    }

    GameAudio.setEngineSpeed(player.speed / player.maxSpeed);

    if (player.finished) {
      finishRace();
      return;
    }
    if (bikes.every((b) => b.finished)) {
      finishRace();
    }
  }

  function worldToScreenTransform() {
    ctx.setTransform(zoom, 0, 0, zoom, canvas.width / 2 - player.x * zoom, canvas.height / 2 - player.y * zoom);
  }

  function drawBike(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(-2, 4, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -9);
    ctx.lineTo(-16, 0);
    ctx.lineTo(-12, 9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#20242c';
    ctx.beginPath();
    ctx.ellipse(10, 0, 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-11, 0, 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (b.isPlayer) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!b.onTrack) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(-2, -16, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWorld() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2f5e34';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    worldToScreenTransform();
    drawTrack(ctx);
    for (const b of bikes) drawBike(b);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawMinimap() {
    const w = minimap.width;
    const h = minimap.height;
    mctx.clearRect(0, 0, w, h);
    const b = TRACK.bounds;
    const pad = 14;
    const sx = (w - pad * 2) / (b.maxX - b.minX);
    const sy = (h - pad * 2) / (b.maxY - b.minY);
    const s = Math.min(sx, sy);
    const ox = pad - b.minX * s + (w - pad * 2 - (b.maxX - b.minX) * s) / 2;
    const oy = pad - b.minY * s + (h - pad * 2 - (b.maxY - b.minY) * s) / 2;

    mctx.strokeStyle = 'rgba(255,255,255,0.5)';
    mctx.lineWidth = 4;
    mctx.beginPath();
    const cl = TRACK.centerline;
    mctx.moveTo(cl[0].x * s + ox, cl[0].y * s + oy);
    for (let i = 1; i < cl.length; i += 2) mctx.lineTo(cl[i].x * s + ox, cl[i].y * s + oy);
    mctx.closePath();
    mctx.stroke();

    for (const bike of bikes) {
      mctx.fillStyle = bike.color;
      mctx.beginPath();
      mctx.arc(bike.x * s + ox, bike.y * s + oy, bike.isPlayer ? 5 : 4, 0, Math.PI * 2);
      mctx.fill();
      if (bike.isPlayer) {
        mctx.strokeStyle = '#fff';
        mctx.lineWidth = 1.5;
        mctx.stroke();
      }
    }
  }

  function updateHud() {
    lapCurrentEl.textContent = Math.min(player.lap + 1, TOTAL_LAPS);
    const pos = player.position || 1;
    positionEl.firstChild.textContent = pos;
    positionSuffixEl.textContent = ordinal(pos);
    raceTimeEl.textContent = formatTime(raceTime);
    speedValueEl.textContent = Math.round(Math.abs(player.speed) * 0.55);
  }

  function loop(ts) {
    if (lastFrame == null) lastFrame = ts;
    let dt = (ts - lastFrame) / 1000;
    lastFrame = ts;
    dt = Math.min(dt, 0.05);

    update(dt);

    if (state === STATE.RACING || state === STATE.COUNTDOWN || state === STATE.FINISHED) {
      if (bikes.length) {
        drawWorld();
        drawMinimap();
        if (player) updateHud();
      }
    }

    requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startRace);
  restartBtn.addEventListener('click', startRace);
  muteBtn.addEventListener('click', () => {
    const muted = GameAudio.toggleMute();
    muteBtn.textContent = muted ? '🔇' : '🔊';
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      if (state === STATE.MENU || state === STATE.FINISHED) startRace();
    }
  });

  requestAnimationFrame(loop);

  // Read-only debug hook (harmless in production, handy for tooling/tests).
  window.__game = {
    get bikes() { return bikes; },
    get player() { return player; },
    get state() { return state; },
  };
})();
