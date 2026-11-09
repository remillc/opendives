// @ts-check
// Why a sync failed (spec, "Sync failures"). No network at all is not a failure:
// it stays the offline state.

/** @typedef {'auth'|'server'|'repository'} SyncFailure */

/** The core starts this message with AUTH when the server refused the credentials. @param {unknown} message */
export const isRefused = (message) => String(message ?? '').startsWith('AUTH');

/**
 * @param {{ online: boolean, gitMode: boolean, refused: boolean }} facts
 * @returns {SyncFailure|null}
 */
export function failureCause({ online, gitMode, refused }) {
  if (!online) return null;
  if (gitMode) return 'repository';
  return refused ? 'auth' : 'server';
}

/** Minutes before the next automatic try: every 5 minutes, then less often. @param {number} attempt from 0 */
export const retryDelay = (attempt) => [5, 15, 30, 60][Math.min(attempt, 3)];
