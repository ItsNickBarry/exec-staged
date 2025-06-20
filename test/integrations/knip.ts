import { TASK_KNIP } from '../fixtures/tasks';
import { TestStage } from '../fixtures/test_stage';
import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

describe('knip', () => {
  it('runs against stage', async () => {
    const stage = TestStage.create();

    stage.writeFile('knip.json', JSON.stringify({ entry: ['*'] }));
    stage.git(['add', 'knip.json']);

    // commit files that will cause knip to fail
    stage.writeFile('test-D.js', `require('unknown-package')`);
    stage.writeFile('test-M.js', `require('unknown-package')`);
    stage.git(['add', 'test-D.js', 'test-M.js']);
    stage.git(['commit', '-m', 'add files']);

    assert.equal(await stage.execStaged([TASK_KNIP]), 1);

    // stage changes to committed files that will fix knip errors
    stage.rm('test-D.js');
    stage.writeFile('test-M.js', '');
    stage.git(['add', 'test-D.js', 'test-M.js']);

    // add unstaged changes that would cause knip to fail if staged
    stage.writeFile('test-A.js', `require('unknown-package')`);
    stage.writeFile('test-M.js', `require('unknown-package')`);

    assert.equal(await stage.execStaged([TASK_KNIP]), 0);

    stage.git(['add', 'test-A.js', 'test-M.js']);

    assert.equal(await stage.execStaged([TASK_KNIP]), 1);
  });
});
