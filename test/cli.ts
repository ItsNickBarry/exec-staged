import {
  BACKUP_STASH_MESSAGE,
  STAGED_CHANGES_COMMIT_MESSAGE,
} from '../src/lib/constants';
import { TASK_EXIT_0, TASK_EXIT_1, TASK_SLEEP } from './fixtures/tasks';
import { TestStage } from './fixtures/test_stage';
import assert from 'node:assert';
import child_process from 'node:child_process';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';

const BIN = path.resolve(import.meta.dirname, '../dist/bin/cli.js');

describe('CLI', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = TestStage.create();
  });

  it('returns exit code 0 on success', async () => {
    const child = child_process.spawn('node', [BIN, TASK_EXIT_0], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 0);
  });

  it('returns exit code 1 on failure', async () => {
    const child = child_process.spawn('node', [BIN, TASK_EXIT_1], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 1);
  });

  it('reverts state on process interrupt', async () => {
    stage.writeFile('test.txt');

    const oldStatus = stage.git(['status', '-z']);

    const child = child_process.spawn('node', [BIN, TASK_SLEEP], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    setTimeout(() => {
      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
      // assert that kill signal was received before process ended normally
      assert(child.kill());
    }, 750);

    await closed;

    const newStatus = stage.git(['status', '-z']);

    assert.equal(child.exitCode, 1);
    assert.equal(newStatus, oldStatus);
    assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    assert(!stage.git(['log']).includes(STAGED_CHANGES_COMMIT_MESSAGE));
  });

  it('loads config from file', async () => {
    const stage = TestStage.create();
    stage.writeFile(
      'exec-staged.config.ts',
      `export default ['${TASK_EXIT_1}'];`,
    );

    const child = child_process.spawn('node', [BIN], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 1);
  });

  it('recovers from failed run', async () => {
    stage.writeFile('test.txt', 'staged contents');
    stage.git(['add', 'test.txt']);
    stage.writeFile('test.txt', 'unstaged contents');

    const oldStatus = stage.git(['status', '-z']);

    stage.prepare();

    const child = child_process.spawn('node', [BIN, 'recover'], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 0);

    const newStatus = stage.git(['status', '-z']);
    assert.equal(newStatus, oldStatus);
    assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
  });

  it('returns exit code 0 when nothing to recover', async () => {
    const child = child_process.spawn('node', [BIN, 'recover'], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 0);
  });
});
