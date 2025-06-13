import { BACKUP_STASH_MESSAGE } from '../src/lib/constants';
import { TASK_SLEEP } from './fixtures/tasks';
import { TestStage } from './fixtures/test_stage';
import assert from 'node:assert';
import child_process from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('CLI', () => {
  it('reverts state on process interrupt', async () => {
    const stage = TestStage.create();
    stage.writeFile('test.txt');

    const oldStatus = stage.git(['status', '-z']);

    const child = child_process.fork(
      path.resolve(import.meta.dirname, '../src/bin/cli.ts'),
      [TASK_SLEEP],
      { cwd: stage.cwd },
    );

    const result = new Promise<void>((resolve) => {
      child.on('close', () => resolve());
    });

    setTimeout(() => {
      child.kill();
    }, 500);

    await result;

    const newStatus = stage.git(['status', '-z']);

    assert.equal(child.exitCode, 1);
    assert.equal(newStatus, oldStatus);
    assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
  });
});
