/**
 * A short tone plus a vibration, generated rather than shipped as an asset —
 * one more file to fetch for a sound this small isn't worth it.
 *
 * Both are best-effort. Audio can be blocked by an autoplay policy before any
 * user gesture reaches this tab, and `navigator.vibrate` does not exist on
 * iOS Safari at all; either missing is a silent no-op, not a broken feature.
 *
 * Shared between the rest timer and the stretch hold timer — same "a
 * countdown just hit zero and you're not looking at the phone" moment
 * either way.
 */
export function playAlert() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = () => ctx.close();
    }
  } catch {
    // Nothing to do about an AudioContext that refuses to run.
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
