// SPDX-License-Identifier: GPL-2.0
// Claude Code hook (registered in .claude/settings.json): shows the open
// tasks of docs/agent-inbox.md.
//   node agent-inbox.mjs start   -> all open tasks (SessionStart)
//   node agent-inbox.mjs prompt  -> open tasks new or changed since last shown (UserPromptSubmit)
//   node agent-inbox.mjs tool    -> the same, after each tool call (PostToolUse), so that a
//                                   task added while the agent works is seen at its next step
// For start and prompt, plain stdout is added to the agent's context; for
// tool, the text goes in hookSpecificOutput.additionalContext (JSON).
// A FileChanged hook would not do: its output never reaches the agent.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const inboxPath = join(root, 'docs', 'agent-inbox.md');
const seenPath = join(root, '.claude', 'inbox-seen.json');
const mode = ['prompt', 'tool'].includes(process.argv[2]) ? process.argv[2] : 'start';

if (!existsSync(inboxPath)) process.exit(0);

// Seen state: the inbox's modification time, and a hash of each open task's
// text as last shown. An older state (a list of ids) counts as seen as is.
/** @type {{ mtime?: number, tasks: Record<string, string|null> }} */
let seen = { tasks: {} };
try {
  const raw = JSON.parse(readFileSync(seenPath, 'utf8'));
  seen = Array.isArray(raw) ? { tasks: Object.fromEntries(raw.map((id) => [id, null])) } : raw;
} catch {
  seen = { tasks: {} };
}

// After a tool call, nothing to do when the file has not changed: this runs often.
const mtime = statSync(inboxPath).mtimeMs;
if (mode === 'tool' && seen.mtime === mtime) process.exit(0);

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

/** New: never shown; changed: shown before with another text (a state of ids only has no hash). */
const isNew = (t) => !(t.id in seen.tasks);
const isChanged = (t) => t.id in seen.tasks && seen.tasks[t.id] !== null && seen.tasks[t.id] !== t.hash;
const shown = mode === 'start' ? open : open.filter((t) => isNew(t) || isChanged(t));

if (shown.length > 0) {
  const head =
    mode === 'start'
      ? `docs/agent-inbox.md has ${open.length} open task(s). Do them in order, following AGENTS.md, then mark each one "[x]" in the same commit as its work.`
      : `docs/agent-inbox.md has new or changed open task(s) since you last looked:`;
  const label = (t) => (mode !== 'start' && isChanged(t) ? '(changed) ' : '');
  const message = head + '\n\n' + shown.map((t) => label(t) + t.body).join('\n\n') + '\n';
  if (mode === 'tool') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } }));
  } else {
    process.stdout.write(message);
  }
}

const state = { mtime, tasks: Object.fromEntries(open.map((t) => [t.id, t.hash])) };
try {
  writeFileSync(seenPath, JSON.stringify(state));
} catch {
  /* not fatal */
}
