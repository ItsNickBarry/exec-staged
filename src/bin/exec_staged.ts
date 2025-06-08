#!/usr/bin/env node
import pkg from '../../package.json' with { type: 'json' };
import { simpleGit } from 'simple-git';

const STASH_MESSAGE = `💾 ${pkg.name} backup stash`;

const git = simpleGit();

const version = await git.version();

if (version.major < 2 || (version.major === 2 && version.minor < 14)) {
  throw new Error('unsupported git version');
}

const list = await git.stash(['list']);

if (list.includes(STASH_MESSAGE)) {
  throw new Error(
    'backup stash found in stash list must be removed before running',
  );
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

// TODO: run tasks

console.log('➡️ Restoring unstaged changes...');
git.stash(['apply', 'stash@{0}']);

// TODO: restore stash if errors

console.log('➡️ Dropping stash...');
await git.stash(['drop', `stash@{0}`]);
