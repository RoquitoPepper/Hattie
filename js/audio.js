const GameAudio = (function () {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function startEngine() {
    const c = ensureContext();
    if (!c || engineOsc) return;
    engineOsc = c.createOscillator();
    engineGain = c.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(c.destination);
    engineOsc.start();
  }

  function setEngineSpeed(speedRatio) {
    if (!engineOsc || !ctx) return;
    const freq = 55 + Math.abs(speedRatio) * 180;
    engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
    const targetGain = muted ? 0 : 0.05 + Math.abs(speedRatio) * 0.05;
    engineGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.08);
  }

  function stopEngine() {
    if (engineGain && ctx) {
      engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  }

  function beep(freq, duration, when = 0) {
    const c = ensureContext();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(c.destination);
    const t = c.currentTime + when;
    osc.start(t);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.stop(t + duration + 0.02);
  }

  function countdownBeep(step) {
    beep(step === 0 ? 880 : 440, 0.18);
  }

  function finishJingle() {
    beep(523, 0.15, 0);
    beep(659, 0.15, 0.15);
    beep(784, 0.3, 0.3);
  }

  function toggleMute() {
    muted = !muted;
    if (muted && engineGain && ctx) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    return muted;
  }

  return {
    ensureContext,
    startEngine,
    setEngineSpeed,
    stopEngine,
    countdownBeep,
    finishJingle,
    toggleMute,
    get muted() { return muted; },
  };
})();
