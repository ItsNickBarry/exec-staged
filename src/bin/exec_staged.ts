#!/usr/bin/env node
import pkg from '../../package.json' with { type: 'json' };
import child_process from 'node:child_process';
import { simpleGit } from 'simple-git';

const STASH_MESSAGE = `💾 ${pkg.name} backup stash`;

const git = simpleGit();

const version = await git.version();

if (version.major < 2 || (version.major === 2 && version.minor < 14)) {
  console.log('⚠️ Unsupported git version!');
  process.exit(1);
}

const list = await git.stash(['list']);

if (list.includes(STASH_MESSAGE)) {
  console.log(`⚠️ Found unexpected ${pkg.name} backup stash!`);
  console.log(
    'It must be left over from a previous failed run.  Remove it before proceeding.',
  );
  process.exit(1);
}

console.log('➡️ Creating backup stash and hiding unstaged changes...');
await git.stash([
  'push',
  '--keep-index',
  '--include-untracked',
  '--message',
  STASH_MESSAGE,
]);

// TODO: restore merge status

const tasks = ['prettier --write .', 'knip'];

console.log('➡️ Running tasks...');

for (const task of tasks) {
  const result = child_process.spawnSync('pnpm', task.split(' '), {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.log(`⚠️ Error running task: \`${task}\`!`);
    console.log('➡️ Restoring state from backup stash...');
    await git.reset(['--hard', 'HEAD']);
    await git.stash(['apply', '--index', 'stash@{0}']);
    console.log('➡️ Dropping backup stash...');
    await git.stash(['drop', 'stash@{0}']);
    process.exit(1);
  }
}

console.log('➡️ Adding changes made by tasks...');
await git.add(['-A']);

try {
  console.log('➡️ Restoring unstaged changes...');
  await git.stash(['apply', '--index', 'stash@{0}']);
} catch (error) {
  console.log('⚠️ Error restoring unstaged changes!');
  console.log('➡️ Restoring state from backup stash...');
  await git.reset(['--hard', 'HEAD']);
  await git.stash(['apply', '--index', 'stash@{0}']);
  console.log('➡️ Dropping backup stash...');
  await git.stash(['drop', 'stash@{0}']);
  process.exit(1);
}

console.log('➡️ Dropping backup stash...');
await git.stash(['drop', 'stash@{0}']);
