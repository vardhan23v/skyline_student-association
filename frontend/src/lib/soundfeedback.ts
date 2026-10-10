// UI Audio and Haptic micro-feedback synthesizer using Web Audio API

class SoundFeedback {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ssa_sound_feedback') : null;
    this.enabled = saved !== null ? saved === 'true' : false;
  }

  private getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ssa_sound_feedback', String(val));
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public playClick() {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // Non-blocking
    }
  }

  public triggerHaptic(pattern: number | number[] = 10) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }
}

export const soundFeedback = new SoundFeedback();
