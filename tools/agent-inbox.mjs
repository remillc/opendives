// SPDX-License-Identifier: GPL-2.0
// Claude Code hook (registered in .claude/settings.json): shows the open
// tasks of docs/agent-inbox.md.
//   node inbox.mjs start   -> all open tasks (SessionStart)
//   node inbox.mjs prompt  -> only open tasks not shown yet (UserPromptSubmit)
// Plain stdout is added to the agent's context for both events.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const inboxPath = join(root, 'docs', 'agent-inbox.md');
const seenPath = join(root, '.claude', 'inbox-seen.json');
const mode = process.argv[2] === 'prompt' ? 'prompt' : 'start';

if (!existsSync(inboxPath)) process.exit(0);
const text = readFileSync(inboxPath, 'utf8');

// A task starts with a heading "## [ ] <id> <title>"; it ends at the next "## " heading.
const tasks = [];
const re = /^## \[( |x)\] (\S+) (.*)$/gm;
let m;
const starts = [];
while ((m = re.exec(text)) !== null) starts.push({ index: m.index, done: m[1] === 'x', id: m[2], title: m[3] });
starts.forEach((t, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
  tasks.push({ ...t, body: text.slice(t.index, end).trim() });
});
const open = tasks.filter((t) => !t.done);

let seen = [];
try { seen = JSON.parse(readFileSync(seenPath, 'utf8')); } catch { seen = []; }
const shown = mode === 'start' ? open : open.filter((t) => !seen.includes(t.id));

if (shown.length > 0) {
  const head = mode === 'start'
    ? `docs/agent-inbox.md has ${open.length} open task(s). Do them in order, following AGENTS.md, then mark each one "[x]" in the same commit as its work.`
    : `New task(s) were added to docs/agent-inbox.md since you last looked:`;
  process.stdout.write(head + '\n\n' + shown.map((t) => t.body).join('\n\n') + '\n');
}
try { writeFileSync(seenPath, JSON.stringify(open.map((t) => t.id))); } catch { /* not fatal */ }
