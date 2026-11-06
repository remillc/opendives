// SPDX-License-Identifier: GPL-2.0
// Claude Code hook (registered in .claude/settings.json): shows the open
// tasks of docs/agent-inbox.md.
//   node agent-inbox.mjs start   -> all open tasks (SessionStart)
//   node agent-inbox.mjs prompt  -> open tasks new or changed since last shown (UserPromptSubmit)
//   node agent-inbox.mjs tool    -> the same, after each tool call (PostToolUse), so that a
//                                   task added while the agent works is seen at its next step
//   node agent-inbox.mjs watch   -> runs in the background (asyncRewake hook, started at
//                                   SessionStart and Stop): waits until the inbox gets a new
//                                   or changed open task, then prints it on stderr and exits
//                                   with code 2, which wakes an idle session
// For start and prompt, plain stdout is added to the agent's context; for
// tool, the text goes in hookSpecificOutput.additionalContext (JSON).
// A FileChanged hook would not do: its output never reaches the agent.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const inboxPath = join(root, 'docs', 'agent-inbox.md');
const seenPath = join(root, '.claude', 'inbox-seen.json');
const watchPidPath = join(root, '.claude', 'inbox-watch.pid');
const mode = ['prompt', 'tool', 'watch'].includes(process.argv[2]) ? process.argv[2] : 'start';
const POLL_MS = Number(process.env.OD_INBOX_POLL_MS) || 2000;

/** @typedef {{ mtime?: number, tasks: Record<string, string|null> }} Seen */

/**
 * Seen state: the inbox's modification time, and a hash of each open task's
 * text as last shown. An older state (a list of ids) counts as seen as is.
 * @returns {Seen}
 */
function readSeen() {
  try {
    const raw = JSON.parse(readFileSync(seenPath, 'utf8'));
    return Array.isArray(raw) ? { tasks: Object.fromEntries(raw.map((id) => [id, null])) } : raw;
  } catch {
    return { tasks: {} };
  }
}

/**
 * Text of the open tasks to show (all of them at start, otherwise the new or
 * changed ones), or '' when there is none; records the open tasks as seen.
 * @param {Seen} seen
 * @param {number} mtime
 */
function report(seen, mtime) {
  const text = readFileSync(inboxPath, 'utf8');

  // A task starts with a heading "## [ ] <id> <title>"; it ends at the next "## " heading.
  const tasks = [];
  const re = /^## \[( |x)\] (\S+) (.*)$/gm;
  let m;
  const starts = [];
  while ((m = re.exec(text)) !== null) starts.push({ index: m.index, done: m[1] === 'x', id: m[2], title: m[3] });
  starts.forEach((t, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const body = text.slice(t.index, end).trim();
    tasks.push({ ...t, body, hash: createHash('sha1').update(body).digest('hex') });
  });
  const open = tasks.filter((t) => !t.done);

  // New: never shown; changed: shown before with another text (a state of ids only has no hash).
  const isNew = (t) => !(t.id in seen.tasks);
  const isChanged = (t) => t.id in seen.tasks && seen.tasks[t.id] !== null && seen.tasks[t.id] !== t.hash;
  const shown = mode === 'start' ? open : open.filter((t) => isNew(t) || isChanged(t));

  let message = '';
  if (shown.length > 0) {
    const head =
      mode === 'start'
        ? `docs/agent-inbox.md has ${open.length} open task(s). Do them in order, following AGENTS.md, then mark each one "[x]" in the same commit as its work.`
        : `docs/agent-inbox.md has new or changed open task(s) since you last looked:`;
    const label = (t) => (mode !== 'start' && isChanged(t) ? '(changed) ' : '');
    message = head + '\n\n' + shown.map((t) => label(t) + t.body).join('\n\n') + '\n';
  }

  try {
    writeFileSync(seenPath, JSON.stringify({ mtime, tasks: Object.fromEntries(open.map((t) => [t.id, t.hash])) }));
  } catch {
    /* not fatal */
  }
  return message;
}

/**
 * Background watcher. Only the latest one keeps running: each writes its pid,
 * and an older one that finds another pid stops without a word.
 */
function watch() {
  try {
    writeFileSync(watchPidPath, String(process.pid));
  } catch {
    process.exit(0);
  }
  const timer = setInterval(() => {
    let owner = '';
    try {
      owner = readFileSync(watchPidPath, 'utf8').trim();
    } catch {
      /* removed: stop */
    }
    if (owner !== String(process.pid)) {
      clearInterval(timer);
      process.exit(0);
    }
    if (!existsSync(inboxPath)) return;
    const mtime = statSync(inboxPath).mtimeMs;
    const seen = readSeen();
    if (seen.mtime === mtime) return;
    const message = report(seen, mtime);
    if (message) {
      clearInterval(timer);
      process.stderr.write(message);
      process.exitCode = 2; // asyncRewake: wakes the session with this text
    }
  }, POLL_MS);
}

if (mode === 'watch') {
  watch();
} else if (existsSync(inboxPath)) {
  const seen = readSeen();
  // After a tool call, nothing to do when the file has not changed: this runs often.
  const mtime = statSync(inboxPath).mtimeMs;
  if (!(mode === 'tool' && seen.mtime === mtime)) {
    const message = report(seen, mtime);
    if (message && mode === 'tool') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } }));
    } else if (message) {
      process.stdout.write(message);
    }
  }
}
