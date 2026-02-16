import { TASK_EXIT_0, TASK_EXIT_1 } from '../fixtures/tasks';
import { TestStage } from '../fixtures/test_stage';
import assert from 'node:assert';
import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const BIN = path.resolve(import.meta.dirname, '../../dist/bin/cli.js');

describe('symlinks', () => {
  it('runs with symlinked staged files', async () => {
    const stage = TestStage.create();
    stage.writeFile('test.js', 'contents');
    stage.symlink('test.js', 'symlink.js');
    stage.git(['add', 'test.js', 'symlink.js']);

    assert.equal(await stage.execStaged([TASK_EXIT_0]), true);
  });

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

  it('throws with symlinked git directory pointing inside repository', async () => {
    const stage = TestStage.create();
    stage.rename('.git', '.git-symlinked');
    stage.symlink('.git-symlinked', '.git');

    assert.equal(await stage.execStaged([TASK_EXIT_0]), false);
  });

  it('runs with symlinked git directory pointing outside repository', async () => {
    const stage = TestStage.create();
    // use a second stage's tmp dir as an external location for the git dir
    const external = TestStage.create();
    const externalGitDir = path.resolve(external.cwd, '.git-external');

    fs.renameSync(path.resolve(stage.cwd, '.git'), externalGitDir);
    fs.symlinkSync(externalGitDir, path.resolve(stage.cwd, '.git'));

    assert.equal(await stage.execStaged([TASK_EXIT_0]), true);
  });
});
