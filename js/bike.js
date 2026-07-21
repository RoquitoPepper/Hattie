function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const TOTAL_LAPS = 3;

class Bike {
  constructor(opts) {
    this.name = opts.name;
    this.color = opts.color;
    this.isPlayer = !!opts.isPlayer;

    this.x = opts.x;
    this.y = opts.y;
    this.angle = opts.angle || 0;
    this.speed = 0;

    this.baseMaxSpeed = opts.maxSpeed || 620;
    this.maxSpeed = this.baseMaxSpeed;
    this.accel = opts.accel || 400;
    this.brakeForce = 760;
    this.reverseMaxSpeed = 180;
    this.turnRate = opts.turnRate || 2.7;
    this.aiSkill = opts.aiSkill != null ? opts.aiSkill : 0.9 + Math.random() * 0.15;

    const hint = trackFindNearestFull({ x: this.x, y: this.y });
    this.trackIndex = hint.index;
    // Signed, unbounded odometer of progress along the centerline. Grid
    // spawns start it negative (staggered behind the line) so ranking is
    // correct before anyone has moved; it crosses 0 when a bike reaches
    // the start line and >= TRACK.count when it completes a lap.
    this.lapDistance = opts.startOffset || 0;
    this.lap = 0;
    this.finished = false;
    this.finishTime = null;
    this.finishPosition = null;
    this.lapTimes = [];
    this.lastLapStart = 0;
    this.onTrack = true;
  }

  get totalProgress() {
    return this.lap * TRACK.count + this.lapDistance;
  }

  aiControls() {
    const cl = TRACK.centerline;
    const n = cl.length;
    const speedFactor = clamp(Math.abs(this.speed) / this.baseMaxSpeed, 0.15, 1);
    const lookAhead = Math.round(28 + speedFactor * 46);
    const target = cl[(this.trackIndex + lookAhead) % n];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const targetAngle = Math.atan2(dy, dx);
    const diff = normalizeAngle(targetAngle - this.angle);

    const steer = clamp(diff * 2.4, -1, 1);
    let throttle = 1 - clamp(Math.abs(diff) * 1.15, 0, 0.75);
    throttle *= this.aiSkill;
    return { throttle, steer, brake: false };
  }

  update(dt, raceTime, controls) {
    const input = this.isPlayer ? controls : this.aiControls();

    const speedRatio = clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1);
    const turnDir = this.speed < 0 ? -1 : 1;
    const effectiveTurn = this.turnRate * (0.35 + 0.65 * speedRatio) * turnDir;
    this.angle += input.steer * effectiveTurn * dt;

    const nearest = trackFindNearest({ x: this.x, y: this.y }, this.trackIndex);
    const oldIndex = this.trackIndex;
    this.trackIndex = nearest.index;
    this.onTrack = nearest.dist <= TRACK.width / 2;

    const speedCap = this.onTrack ? this.maxSpeed : this.maxSpeed * 0.55;
    const accelMult = this.onTrack ? 1 : 0.5;

    if (input.throttle > 0) {
      this.speed += this.accel * accelMult * input.throttle * dt;
    } else if (input.throttle < 0) {
      this.speed += this.brakeForce * 0.6 * input.throttle * dt;
    }
    if (input.brake) {
      const dec = this.brakeForce * dt;
      if (Math.abs(this.speed) <= dec) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * dec;
    }

    if (input.throttle === 0 && !input.brake) {
      const frictionCoeff = this.onTrack ? 220 : 520;
      const fr = frictionCoeff * dt;
      if (Math.abs(this.speed) <= fr) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * fr;
    }

    this.speed = clamp(this.speed, -this.reverseMaxSpeed, speedCap);

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    // Odometer-based lap counting: accumulate signed progress along the
    // centerline so driving backwards over the line can't fake a lap.
    const n = TRACK.count;
    let delta = this.trackIndex - oldIndex;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    this.lapDistance += delta;

    while (this.lapDistance >= n && !this.finished) {
      this.lapDistance -= n;
      this.lap++;
      this.lapTimes.push(raceTime - this.lastLapStart);
      this.lastLapStart = raceTime;
      if (this.lap >= TOTAL_LAPS) {
        this.finished = true;
        this.finishTime = raceTime;
      }
    }
  }

  bestLap() {
    if (!this.lapTimes.length) return null;
    return Math.min(...this.lapTimes);
  }
}
