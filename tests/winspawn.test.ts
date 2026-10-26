// Windows' .cmd shims: how a CLI the office spawns for its output (the plan limits, the model
// catalogues, a task's name) is handed to child_process, which since Node 20 refuses to run a batch
// script without a shell. `win` is passed in rather than read from the platform, so these run the
// same on the machines the office is usually developed on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shellArg, viaShell } from '../src/server/workers/process.js';

test('a real executable is spawned as it is, on Windows and anywhere else', () => {
  for (const win of [true, false]) {
    assert.deepEqual(viaShell('C:\\tools\\claude.exe', ['-p'], win), { file: 'C:\\tools\\claude.exe', args: ['-p'], shell: false });
  }
  assert.deepEqual(viaShell('/usr/local/bin/claude', ['-p'], false), { file: '/usr/local/bin/claude', args: ['-p'], shell: false });
});

test('a .cmd or .bat shim goes through a shell, whatever its spelling, as one command line', () => {
  for (const file of ['C:\\npm\\claude.CMD', 'C:\\npm\\claude.cmd', 'C:\\npm\\gh.bat']) {
    assert.equal(viaShell(file, ['-p'], true).shell, true, file);
  }
  const run = viaShell('C:\\npm\\claude.CMD', ['-p'], true);
  // Everything in the line, nothing in args: that is what Node's DEP0190 asks for.
  assert.equal(run.file, 'C:\\npm\\claude.CMD -p');
  assert.deepEqual(run.args, []);
});

test('a path with spaces and an empty argument survive cmd.exe reading the line again', () => {
  const run = viaShell('C:\\Program Files\\npm\\claude.cmd', ['--tools', '', '--output-format', 'stream-json'], true);
  // The empty one quoted above all: unquoted it drops out of the line and --tools eats --output-format.
  assert.equal(run.file, '"C:\\Program Files\\npm\\claude.cmd" --tools "" --output-format stream-json');
});

test('an argument cmd would act on is quoted, and a plain one is left alone', () => {
  const run = viaShell('C:\\npm\\opencode.cmd', ['models', 'anthropic/claude-opus-4', 'a&b', 'say "hi"'], true);
  assert.equal(run.file, 'C:\\npm\\opencode.cmd models anthropic/claude-opus-4 "a&b" "say ""hi"""');
});

test('off Windows nothing goes through a shell, even for a file named .cmd', () => {
  const run = viaShell('/usr/bin/claude.cmd', ['', '--tools'], false);
  assert.equal(run.shell, false);
  assert.deepEqual(run.args, ['', '--tools']);
});

// --- A command line written down for another program's shell to read (see shellArg) -------------

test('an argument of a hook command is quoted for the shell that will read it', () => {
  const node = 'C:\\Program Files\\nodejs\\node.exe';
  assert.equal(shellArg(node, true), `"${node}"`);
  assert.equal(shellArg(node, false), `'${node}'`);
  // Nothing to act on: left bare either way, so the line stays readable.
  assert.equal(shellArg('SessionStart', true), 'SessionStart');
  assert.equal(shellArg("/usr/local/bin/node", false), `'/usr/local/bin/node'`);
});

test("Codex's hook command runs on Windows: cmd.exe reads double quotes, never POSIX single ones", () => {
  const hook = 'C:\\Users\\PC\\agent-office\\projects\\owner\\repo\\.agent-office\\agent-office-codex-hook.cjs';
  const line = ['C:\\Program Files\\nodejs\\node.exe', hook, 'SessionStart'].map((a) => shellArg(a, true)).join(' ');
  // Single quotes here are what made cmd.exe answer "The filename, directory name, or volume label
  // syntax is incorrect" and the hook exit 1 before it ever started.
  assert.doesNotMatch(line, /'/);
  assert.equal(line, `"C:\\Program Files\\nodejs\\node.exe" ${hook} SessionStart`);
});
