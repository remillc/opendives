// @ts-check
// Live validation of a form field (Christian's rule of 14 November 2026: forms are validated
// as the diver types). An error is not thrown at the first letter: it shows once the typing
// has paused on a value that is not valid, and leaves at once when the value becomes valid.

/** Pause in the typing, in ms, after which an invalid value is told. */
export const TYPING_PAUSE = 700;

/**
 * The error of a field while it is typed in.
 * @param {() => string} value the field's current text (read reactively)
 * @param {(text: string) => string} check the error for a text, '' when it is valid; an empty
 *   field is not checked (a required field is said by the form's button, not by an error)
 * @param {number} [pause]
 * @returns {{ readonly error: string }} `error`: '' while typing or valid, else the message
 */
export function liveError(value, check, pause = TYPING_PAUSE) {
  /** The text the typing last paused on. */
  let settled = $state(value());
  $effect(() => {
    const text = value();
    const timer = setTimeout(() => (settled = text), pause);
    return () => clearTimeout(timer);
  });
  return {
    get error() {
      const text = value();
      if (!text.trim() || text !== settled) return '';
      return check(text);
    },
  };
}
