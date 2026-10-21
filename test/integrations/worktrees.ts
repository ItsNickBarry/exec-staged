import { BACKUP_WORKING_TREE_REF } from '../../src/lib/constants.js';
import { TASK_APPEND_FILES, TASK_EXIT_0 } from '../fixtures/tasks';
import { TestStage } from '../fixtures/test_stage';
import assert from 'node:assert';
import child_process from 'node:child_process';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';

const BIN = path.resolve(import.meta.dirname, '../../dist/bin/cli.js');

describe('worktrees', () => {
  let main: TestStage;
  let linked: TestStage;

  beforeEach(async () => {
    main = TestStage.create();
    // use a second stage's tmp dir as an external location for the linked
    // worktree
    const external = TestStage.create();
    const linkedPath = path.resolve(external.cwd, 'worktree');
    main.git(['worktree', 'add', '--detach', linkedPath]);
    linked = new TestStage(linkedPath);
  });

  it('runs in linked worktree', async () => {
    linked.writeFile('staged.txt', 'staged\n');
    linked.git(['add', 'staged.txt']);
    linked.writeFile('staged.txt', 'unstaged\nstaged\n');
    linked.writeFile('untracked.txt', 'untracked');

    assert.equal(await linked.execStaged([TASK_APPEND_FILES]), true);

    assert.equal(linked.git(['show', ':staged.txt']), 'staged\nmodified');
    assert.equal(linked.readFile('staged.txt'), 'unstaged\nstaged\nmodified\n');
    assert.equal(linked.readFile('untracked.txt'), 'untracked');
    assert(!linked.hasBackup());
  });

  it('garbage collects backup when worktree is deleted', async () => {
    linked.writeFile('untracked.txt', 'untracked');
    linked.check();
    linked.prepare();

    const workingTree = linked
      .git(['rev-parse', BACKUP_WORKING_TREE_REF])
      .trim();

    // unstaged changes are hidden by the backup, so the linked worktree appears
    // clean and can be removed without --force
    main.git(['worktree', 'remove', linked.cwd]);

    // the backup refs were stored in the linked worktree's git dir, so the
    // backed-up working tree is now unreachable and is deleted by garbage
    // collection
    main.git(['cat-file', '-e', workingTree]);
    main.git(['gc', '--prune=now']);
    assert.throws(() => main.git(['cat-file', '-e', workingTree]));
  });

  it('recovers from failed run in linked worktree via CLI', async () => {
    linked.writeFile('test.txt', 'staged contents');
    linked.git(['add', 'test.txt']);
    linked.writeFile('test.txt', 'unstaged contents');

    const oldStatus = linked.git(['status', '-z']);

    linked.prepare();

    const child = child_process.spawn('node', [BIN, 'recover'], {
      cwd: linked.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 0);

    const newStatus = linked.git(['status', '-z']);
    assert.equal(newStatus, oldStatus);
    assert.equal(linked.readFile('test.txt'), 'unstaged contents');
    assert(!linked.hasBackup());
  });

  describe('with backup in main worktree', () => {
    beforeEach(async () => {
      // leave the main worktree mid-run, with unstaged changes hidden in a backup
      main.writeFile('main.txt', 'main contents');
      main.check();
      main.prepare();
      assert(main.hasBackup());
    });

    it('runs in linked worktree', async () => {
      linked.writeFile('linked.txt', 'linked contents');
      linked.git(['add', 'linked.txt']);

      assert.equal(await linked.execStaged([TASK_EXIT_0]), true);
    });

    it('does not restore backup of main worktree into linked worktree', async () => {
      linked.writeFile('linked.txt', 'linked contents');

      linked.recover();

      assert.equal(linked.readFile('linked.txt'), 'linked contents');
      assert.throws(() => linked.readFile('main.txt'), /ENOENT/);
    });

    it('does not delete backup of main worktree when recovering linked worktree', async () => {
      linked.recover();

      assert(main.hasBackup());

      main.recover();

      assert.equal(main.readFile('main.txt'), 'main contents');
    });
  });

  describe('with backup in linked worktree', () => {
    beforeEach(async () => {
      // leave the linked worktree mid-run, with unstaged changes hidden in a backup
      linked.writeFile('linked.txt', 'linked contents');
      linked.check();
      linked.prepare();
      assert(linked.hasBackup());
    });

    it('runs in main worktree', async () => {
      main.writeFile('main.txt', 'main contents');
      main.git(['add', 'main.txt']);

      assert.equal(await main.execStaged([TASK_EXIT_0]), true);
    });

    it('does not restore backup of linked worktree into main worktree', async () => {
      main.writeFile('main.txt', 'main contents');

      main.recover();

      assert.equal(main.readFile('main.txt'), 'main contents');
      assert.throws(() => main.readFile('linked.txt'), /ENOENT/);
    });

    it('does not delete backup of linked worktree when recovering main worktree', async () => {
      main.recover();

      assert(linked.hasBackup());

      linked.recover();

      assert.equal(linked.readFile('linked.txt'), 'linked contents');
    });
  });
});
