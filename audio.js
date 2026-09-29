/**
 * Web Audio API Sound Synthesizer
 * 100% offline, zero external audio assets required.
 */

const SoundManager = {
  ctx: null,
  enabled: true,

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
  },

  resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.15) {
    if (!this.enabled) return;
    try {
      this.init();
      this.resumeContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('[Audio] Error playing tone:', e);
    }
  },

  // Crisp scanner beep (1850Hz short pulse)
  playScanBeep() {
    this.playTone(1850, 'sine', 0.06, 0.2);
  },

  // Pleasant success double-chime on sale completion
  playSuccessChime() {
    if (!this.enabled) return;
    try {
      this.init();
      this.resumeContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [
        { freq: 587.33, start: 0, dur: 0.12 },     // D5
        { freq: 880.00, start: 0.1, dur: 0.22 }    // A5
      ].forEach(note => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        gain.gain.setValueAtTime(0.18, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur);
      });
    } catch (e) {
      console.warn('[Audio] Error playing success chime:', e);
    }
  },

  // Warning or item not found buzzer
  playErrorBuzzer() {
    if (!this.enabled) return;
    try {
      this.init();
      this.resumeContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {
      console.warn('[Audio] Error playing error sound:', e);
    }
  },

  // Cash drawer mechanical / register sound
  playCashDrawer() {
    if (!this.enabled) return;
    try {
      this.init();
      this.resumeContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [
        { freq: 1200, start: 0, dur: 0.05 },
        { freq: 1600, start: 0.04, dur: 0.08 },
        { freq: 2400, start: 0.08, dur: 0.15 }
      ].forEach(item => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(item.freq, now + item.start);
        gain.gain.setValueAtTime(0.08, now + item.start);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + item.start + item.dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + item.start);
        osc.stop(now + item.start + item.dur);
      });
    } catch (e) {
      console.warn('[Audio] Cash drawer sound:', e);
    }
  }
};

window.SoundManager = SoundManager;
