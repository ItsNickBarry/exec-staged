import { TASK_EXIT_0, TASK_EXIT_1 } from '../fixtures/tasks';
import { TestStage } from '../fixtures/test_stage';
import assert from 'node:assert';
import child_process from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';

const BIN = path.resolve(import.meta.dirname, '../../dist/bin/cli.js');

describe('symlinks', () => {
  it('runs with symlinked config file', async () => {
    const stage = TestStage.create();
    stage.writeFile(
      'symlinked.config.ts',
      `export default ['${TASK_EXIT_1}'];`,
    );
    stage.symlink('symlinked.config.ts', 'exec-staged.config.ts');

    const child = child_process.spawn('node', [BIN], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 1);
  });

  it('runs with symlinked git directory', async () => {
    const stage = TestStage.create();
    stage.rename('.git', '.git-symlinked');
    stage.symlink('.git-symlinked', '.git');

    assert.equal(await stage.execStaged([TASK_EXIT_0]), true);
  });
});
