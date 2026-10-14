import { TASK_APPEND_FILES, TASK_EXIT_0 } from '../fixtures/tasks';
import { TestStage } from '../fixtures/test_stage';
import assert from 'node:assert';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';

describe('worktrees', () => {
  let main: TestStage;
  let worktree: TestStage;

  beforeEach(async () => {
    main = TestStage.create();
    // use a second stage's tmp dir as an external location for the worktree
    const external = TestStage.create();
    const worktreePath = path.resolve(external.cwd, 'worktree');
    main.git(['worktree', 'add', '--detach', worktreePath]);
    worktree = new TestStage(worktreePath);
  });

  it('runs in worktree', async () => {
    worktree.writeFile('staged.txt', 'staged\n');
    worktree.git(['add', 'staged.txt']);
    worktree.writeFile('staged.txt', 'unstaged\nstaged\n');
    worktree.writeFile('untracked.txt', 'untracked');

    assert.equal(await worktree.execStaged([TASK_APPEND_FILES]), true);

    assert.equal(worktree.git(['show', ':staged.txt']), 'staged\nmodified');
    assert.equal(
      worktree.readFile('staged.txt'),
      'unstaged\nstaged\nmodified\n',
    );
    assert.equal(worktree.readFile('untracked.txt'), 'untracked');
    assert(!worktree.hasBackup());
  });

  describe('with backup in main worktree', () => {
    beforeEach(async () => {
      // leave the main worktree mid-run, with unstaged changes hidden in a backup
      main.writeFile('main.txt', 'main contents');
      main.check();
      main.prepare();
      assert(main.hasBackup());
    });

    it('runs in worktree', async () => {
      worktree.writeFile('worktree.txt', 'worktree contents');
      worktree.git(['add', 'worktree.txt']);

      assert.equal(await worktree.execStaged([TASK_EXIT_0]), true);
    });

    it('does not restore backup of main worktree into local worktree', async () => {
      worktree.writeFile('worktree.txt', 'worktree contents');

      worktree.recover();

      assert.equal(worktree.readFile('worktree.txt'), 'worktree contents');
      assert.throws(() => worktree.readFile('main.txt'), /ENOENT/);
    });

    it('does not delete backup of main worktree when recovering local worktree', async () => {
      worktree.recover();

      assert(main.hasBackup());

      main.recover();

      assert.equal(main.readFile('main.txt'), 'main contents');
    });
  });
});
