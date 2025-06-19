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

    const exitCode = await stage.execStaged([]);

    assert.equal(exitCode, 1);
  });

  it('returns exit code 1 if not git repository', async () => {
    stage.rm('.git');

    const exitCode = await stage.execStaged([]);

    assert.equal(exitCode, 1);
  });

  it('returns exit code 0 if all tasks and git operations pass', async () => {
    const exitCode = await stage.execStaged([TASK_EXIT_0]);

    assert.equal(exitCode, 0);
  });

  it('returns exit code 1 if task fails', async () => {
    const exitCode = await stage.execStaged([TASK_EXIT_1]);

    assert.equal(exitCode, 1);
  });

  it('returns exit code 0 if no files are known to git', async () => {
    // This tests a special case where `git stash` throws an error if no files
    // are known to git, despite successful creation of the empty stash.
    stage.rm('.');
    stage.mkdir('.');
    stage.git(['init']);
    stage.git(['commit', '-m', 'initial commit', '--allow-empty']);

    const exitCode = await stage.execStaged([TASK_EXIT_0]);

    assert.equal(exitCode, 0);
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

    const exitCode = await stage.execStaged([TASK_ASSERT_NO_CHANGES]);

    assert.equal(exitCode, 0);
  });

  it('hides unstaged modifications to staged additions from tasks', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.writeFile('test.txt', 'new contents');

    const exitCode = await stage.execStaged([
      TASK_ASSERT_CHANGES,
      TASK_ASSERT_NO_UNSTAGED_CHANGES,
    ]);

    assert.equal(exitCode, 0);
  });

  it('hides unstaged deletions from tasks (restores the files)', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add files']);
    stage.rm('test.txt');

    const exitCode = await stage.execStaged([TASK_ASSERT_NO_CHANGES]);

    assert.equal(exitCode, 0);
  });

  it('does not hide staged additions from tasks', async () => {
    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);

    const exitCode = await stage.execStaged([TASK_ASSERT_CHANGES]);

    assert.equal(exitCode, 0);
  });

  it('does not hide staged modifications from tasks', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.writeFile('test.txt', 'new contents');
    stage.git(['add', 'test.txt']);

    const exitCode = await stage.execStaged([TASK_ASSERT_CHANGES]);

    assert.equal(exitCode, 0);
  });

  it('does not hide staged deletions from tasks', async () => {
    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.rm('test.txt');
    stage.git(['add', 'test.txt']);

    const exitCode = await stage.execStaged([TASK_ASSERT_CHANGES]);

    assert.equal(exitCode, 0);
  });

  // TODO: test merge

  it('restores staged additions on task failure', async () => {
    stage.writeFile('test.txt');
    stage.writeFile('subdirectory/test.txt');
    stage.git(['add', 'test.txt']);

    const oldStatus = stage.git(['status', '-v']);
    const exitCode = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(exitCode, 1);
    assert.equal(newStatus, oldStatus);
  });

  it('restores unstaged additions on task failure', async () => {
    stage.writeFile('test.txt');
    stage.writeFile('subdirectory/test.txt');

    const oldStatus = stage.git(['status', '-v']);
    const exitCode = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(exitCode, 1);
    assert.equal(newStatus, oldStatus);
  });

  it('restores staged modifications on task failure', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.writeFile('test.txt', 'new contents');
    stage.git(['add', 'test.txt']);

    const oldStatus = stage.git(['status', '-v']);
    const exitCode = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(exitCode, 1);
    assert.equal(newStatus, oldStatus);
  });

  it('restores unstaged modifications on task failure', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.writeFile('test.txt', 'new contents');

    const oldStatus = stage.git(['status', '-v']);
    const exitCode = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(exitCode, 1);
    assert.equal(newStatus, oldStatus);
  });

  it('restores unstaged modifications to staged additions on task failure', async () => {
    stage.writeFile('test.txt', 'old contents');
    stage.git(['add', 'test.txt']);
    stage.writeFile('test.txt', 'new contents');

    const oldStatus = stage.git(['status', '-v']);
    const exitCode = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(exitCode, 1);
    assert.equal(newStatus, oldStatus);
  });

  it('restores unstaged deletions on task failure', async () => {
    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.rm('test.txt');

    const oldStatus = stage.git(['status', '-v']);
    const exitCode = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(exitCode, 1);
    assert.equal(newStatus, oldStatus);
  });

  it('restores staged deletions on task failure', async () => {
    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);
    stage.git(['commit', '-m', 'add file']);
    stage.rm('test.txt');
    stage.git(['add', 'test.txt']);

    const oldStatus = stage.git(['status', '-v']);
    const exitCode = await stage.execStaged([TASK_EXIT_1]);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(exitCode, 1);
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
    const exitCode = await stage.execStaged(['rm test-M.txt']);
    const newStatus = stage.git(['status', '-v']);

    assert.equal(exitCode, 1);
    assert.equal(newStatus, oldStatus);
  });
});
