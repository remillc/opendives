// @ts-check
// A smoother progress for downloads from a dive computer. libdivecomputer's
// progress can stand still for the whole transfer of a dive and then jump:
// for a Shearwater, a compressed dive counts against the size of the whole
// memory region, and the list of dives assumes a full list until it is read
// (2 %, then done for one new dive). Between two real advances, the bar moves
// on with time, towards the next one as estimated from the last jump (about
// one dive's share), at the pace of the dives received so far; it never goes
// back, never passes that estimate, and follows every real advance at once.

const DEFAULT_DIVE_SECONDS = 10;

export class ProgressSmoother {
  constructor() {
    this.reset();
  }

  reset() {
    /** The real fraction last reported. */
    this.raw = 0;
    /** The fraction shown. */
    this.shown = 0;
    /** The last real jump, an estimate of one dive's share; 0 until there is one. */
    this.lastJump = 0;
    /** @type {number[]} times the dives arrived, in ms */
    this.diveTimes = [];
    /** Time of the first real progress, in ms; 0 before. */
    this.startedAt = 0;
    this.tickAt = 0;
  }

  /**
   * A real fraction from the core.
   * @param {number} fraction 0 to 1
   * @param {number} now ms
   */
  report(fraction, now) {
    if (!(fraction > this.raw)) return;
    if (this.raw > 0) this.lastJump = fraction - this.raw;
    if (!this.startedAt) this.startedAt = now;
    this.raw = Math.min(1, fraction);
    this.shown = Math.max(this.shown, this.raw);
  }

  /** @param {number} now ms */
  diveReceived(now) {
    this.diveTimes.push(now);
  }

  /** Seconds a dive takes, from the dives received so far. */
  diveSeconds() {
    const times = [this.startedAt, ...this.diveTimes].filter(Boolean);
    if (times.length < 2) return DEFAULT_DIVE_SECONDS;
    return Math.max(1, (times[times.length - 1] - times[0]) / 1000 / (times.length - 1));
  }

  /**
   * Moves the shown fraction on with time; returns it.
   * @param {number} now ms
   */
  tick(now) {
    const dt = this.tickAt ? (now - this.tickAt) / 1000 : 0;
    this.tickAt = now;
    if (this.raw <= 0 || this.raw >= 1) return this.shown;
    // Before the first jump (reading the list of dives), stay close.
    const share = this.lastJump > 0 ? this.lastJump : this.raw;
    const cap = Math.min(0.99, this.raw + share * 0.95);
    if (cap > this.shown) this.shown += (cap - this.shown) * (1 - Math.exp(-dt / this.diveSeconds()));
    return this.shown;
  }
}
