import { TASK_EXIT_0 } from '../fixtures/tasks';
import { TestStage } from '../fixtures/test_stage';
import assert from 'node:assert';
import { describe, it } from 'node:test';

describe('symlinks', () => {
  it('runs with symlinked git directory', async () => {
    const stage = TestStage.create();
    stage.rename('.git', '.git-symlinked');
    stage.symlink('.git-symlinked', '.git');

    assert.equal(await stage.execStaged([TASK_EXIT_0]), true);
  });
});
