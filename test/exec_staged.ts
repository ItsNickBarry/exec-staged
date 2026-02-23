import { BACKUP_STASH_MESSAGE } from '../src/lib/constants.js';
import {
  TASK_ASSERT_CHANGES,
  TASK_ASSERT_NO_CHANGES,
  TASK_ASSERT_NO_UNSTAGED_CHANGES,
  TASK_EXIT_0,
  TASK_EXIT_1,
} from './fixtures/tasks.js';
import { TestStage } from './fixtures/test_stage.js';
import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

describe('execStaged', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = TestStage.create();
  });

  it('returns exit code 1 if backup stash from previous run is present', async () => {
    stage.writeFile('test.txt');
    stage.git(['stash', '--all', '-m', BACKUP_STASH_MESSAGE]);

    const result = await stage.execStaged([]);

    assert.equal(result, false);
  });

  it('returns exit code 1 if not git repository', async () => {
    stage.rm('.git');

    const result = await stage.execStaged([]);

    assert.equal(result, false);
  });

  it('returns exit code 0 if all tasks and git operations pass', async () => {
    const result = await stage.execStaged([TASK_EXIT_0]);

    assert.equal(result, true);
  });

  it('returns exit code 1 if task fails', async () => {
    const result = await stage.execStaged([TASK_EXIT_1]);

    assert.equal(result, false);
  });

  it('returns exit code 0 if no files are known to git', async () => {
    // This tests a special case where `git stash` throws an error if no files
    // are known to git, despite successful creation of the empty stash.
    stage.rm('.');
    stage.mkdir('.');
    stage.git(['init']);
    stage.git(['commit', '-m', 'initial commit', '--allow-empty']);

    const result = await stage.execStaged([TASK_EXIT_0]);

    assert.equal(result, true);
  });

  it('hides unstaged additions, deletions, and modifications from tasks', async () => {
    stage.writeFile('test.txt');
    stage.writeFile('subdirectory/test.txt');
    stage.writeFile('test-D.txt');
    stage.writeFile('test-M.txt', 'old contents');
    stage.git(['add', 'test-D.txt', 'test-M.txt']);
    stage.git(['commit', '-m', 'add files']);
    stage.rm('test-D.txt');
    stage.writeFile('test-M.txt', 'new contents');

    const result = await stage.execStaged([TASK_ASSERT_NO_CHANGES]);

    assert.equal(result, true);
  });

  it('hides unstaged modifications to staged additions from tasks', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.writeFile('test.txt', 'new contents');

    const result = await stage.execStaged([
      TASK_ASSERT_CHANGES,
      TASK_ASSERT_NO_UNSTAGED_CHANGES,
    ]);

    assert.equal(result, true);
  });

  it('hides unstaged deletions from tasks (restores the files)', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add files']);
    stage.rm('test.txt');

    const result = await stage.execStaged([TASK_ASSERT_NO_CHANGES]);

    assert.equal(result, true);
  });

  it('does not hide staged additions from tasks', async () => {
    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);

    const result = await stage.execStaged([TASK_ASSERT_CHANGES]);

    assert.equal(result, true);
  });

  it('does not hide staged modifications from tasks', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.writeFile('test.txt', 'new contents');
    stage.git(['add', 'test.txt']);

    const result = await stage.execStaged([TASK_ASSERT_CHANGES]);

    assert.equal(result, true);
  });

  it('does not hide staged deletions from tasks', async () => {
    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.rm('test.txt');
    stage.git(['add', 'test.txt']);

    const result = await stage.execStaged([TASK_ASSERT_CHANGES]);

    assert.equal(result, true);
  });

  // TODO: test merge

  it('restores staged additions on task failure', async () => {
    stage.writeFile('test.txt');
    stage.writeFile('subdirectory/test.txt');
    stage.git(['add', 'test.txt']);

    const oldStatus = stage.git(['status', '-v']);
    const result = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(result, false);
    assert.equal(newStatus, oldStatus);
  });

  it('restores unstaged additions on task failure', async () => {
    stage.writeFile('test.txt');
    stage.writeFile('subdirectory/test.txt');

    const oldStatus = stage.git(['status', '-v']);
    const result = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(result, false);
    assert.equal(newStatus, oldStatus);
  });

  it('restores staged modifications on task failure', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.writeFile('test.txt', 'new contents');
    stage.git(['add', 'test.txt']);

    const oldStatus = stage.git(['status', '-v']);
    const result = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(result, false);
    assert.equal(newStatus, oldStatus);
  });

  it('restores unstaged modifications on task failure', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.writeFile('test.txt', 'new contents');

    const oldStatus = stage.git(['status', '-v']);
    const result = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(result, false);
    assert.equal(newStatus, oldStatus);
  });

  it('restores unstaged modifications to staged additions on task failure', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.writeFile('test.txt', 'new contents');

    const oldStatus = stage.git(['status', '-v']);
    const result = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(result, false);
    assert.equal(newStatus, oldStatus);
  });

  it('restores unstaged deletions on task failure', async () => {
    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.rm('test.txt');

    const oldStatus = stage.git(['status', '-v']);
    const result = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(result, false);
    assert.equal(newStatus, oldStatus);
  });

  it('restores staged deletions on task failure', async () => {
    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.rm('test.txt');
    stage.git(['add', 'test.txt']);

    const oldStatus = stage.git(['status', '-v']);
    const result = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(result, false);
    assert.equal(newStatus, oldStatus);
  });

  it('restores initial state on merge failure', async () => {
    stage.writeFile('test.txt');
    stage.writeFile('subdirectory/test.txt');
    stage.writeFile('test-D.txt');
    stage.writeFile('test-M.txt', 'old contents');
    stage.git(['add', 'test-D.txt', 'test-M.txt']);
    stage.git(['commit', '-m', 'add files']);
    stage.rm('test-D.txt');
    stage.writeFile('test-M.txt', 'new contents');

    const oldStatus = stage.git(['status', '-v']);
    const result = await stage.execStaged(['rm test-M.txt']);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(result, false);
    assert.equal(newStatus, oldStatus);
  });
});

describe('recoverStaged', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = TestStage.create();
  });

  it('returns true when nothing to recover', async () => {
    const result = stage.recoverStaged();

    assert.equal(result, true);
  });

  it('returns true and restores state from backup stash', async () => {
    stage.writeFile('test.txt', 'staged contents');
    stage.git(['add', 'test.txt']);
    stage.writeFile('test.txt', 'unstaged contents');

    const oldStatus = stage.git(['status', '-z']);

    stage.prepare();

    const result = stage.recoverStaged();

    assert.equal(result, true);

    const newStatus = stage.git(['status', '-z']);
    assert.equal(newStatus, oldStatus);
    assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
  });

  it('returns true and restores merge status', async () => {
    const theirBranch = 'their-branch';

    stage.git(['checkout', '-b', theirBranch]);
    stage.writeFile('test.txt', 'incoming contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);

    stage.git(['checkout', '-']);
    stage.writeFile('test.txt', 'current contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);

    assert.throws(() => stage.git(['merge', theirBranch]));

    stage.writeFile('test.txt', 'resolved contents');
    stage.git(['add', 'test.txt']);

    const oldStatus = stage.git(['status']);

    stage.prepare();

    const result = stage.recoverStaged();

    assert.equal(result, true);

    const newStatus = stage.git(['status']);
    assert.equal(newStatus, oldStatus);
  });
});
