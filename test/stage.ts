import { BACKUP_STASH_MESSAGE } from '../src/lib/constants';
import { TASK_EXIT_0, TASK_EXIT_1 } from './fixtures/tasks';
import { TestStage } from './fixtures/test_stage';
import assert from 'node:assert';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';

describe('Stage', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = TestStage.create();
  });

  describe('::check', () => {
    // TODO: test git not present
    // TODO: test git version unsupported

    it('throws if cwd does not exist', async () => {
      stage.rm('.');

      assert.throws(() => stage.check(), /cwd does not exist/);
    });

    it('throws if cwd is not git repository', async () => {
      stage.rm('.git');

      assert.throws(() => stage.check(), /cwd is not a git repository/);
    });

    it('throws if cwd is not root of git repository', async () => {
      stage.mkdir('testdir');

      stage = new TestStage(path.resolve(stage.cwd, 'testdir'));

      assert.throws(
        () => stage.check(),
        /cwd is not a git repository root directory/,
      );
    });

    it('throws if backup stash from previous run is present', async () => {
      stage.writeFile('test.txt');
      stage.git(['stash', '--all', '-m', BACKUP_STASH_MESSAGE]);

      assert.throws(() => stage.check(), /unexpected backup stash/);
    });
  });

  describe('::prepare', () => {
    it('does not create a stash if no changes are in index or working tree', async () => {
      stage.prepare();

      assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if new files are in working tree', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if new files are in index', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if unstaged changes are in working tree', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if staged changes are in index', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if partially staged changes are in index and working tree', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if deleted files are in working tree', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if deleted files are in index', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('hides new files in working tree', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), '');
    });

    it('hides unstaged changes in working tree', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add files']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), '');
    });

    it('hides unstaged changes in working tree to partially staged files but not staged changes in index', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      assert.equal(stage.git(['status', '--porcelain']), 'AM test.txt\n');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt\n');
    });

    it('hides unstaged deleted files in working tree (restores them)', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');

      assert.equal(stage.git(['status', '--porcelain']), ' D test.txt\n');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), '');
    });

    it('does not hide new files in index', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt\n');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt\n');
    });

    it('does not hide staged changes in index', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add files']);
      stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      assert.equal(stage.git(['status', '--porcelain']), 'M  test.txt\n');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'M  test.txt\n');
    });

    it('does not hide staged deleted files in index', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      assert.equal(stage.git(['status', '--porcelain']), 'D  test.txt\n');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'D  test.txt\n');
    });

    it('throws with in-progress merge and unmerged files', async () => {
      const theirBranch = 'their-branch';
      const ourFile = 'current contents';
      const theirFile = 'incoming contents';

      stage.git(['checkout', '-b', theirBranch]);
      stage.writeFile('test.txt', theirFile);
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      stage.git(['checkout', '-']);
      stage.writeFile('test.txt', ourFile);
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      // command throws but leaves the repository in merge state
      assert.throws(() => stage.git(['merge', theirBranch]));

      assert.deepEqual(stage.readFile('test.txt').trim().split('\n'), [
        '<<<<<<< HEAD',
        ourFile,
        '=======',
        theirFile,
        `>>>>>>> ${theirBranch}`,
      ]);

      const oldStatus = stage.git(['status']);
      const oldStatusPorcelain = stage.git(['status', '--porcelain']);
      assert.throws(() => stage.prepare());
      const newStatus = stage.git(['status']);
      const newStatusPorcelain = stage.git(['status', '--porcelain']);

      // TODO:
      assert.equal(newStatus, oldStatus);
      assert.equal(newStatusPorcelain, oldStatusPorcelain);
    });

    it('does not throw with in-progress merge and no unmerged files', async () => {
      const theirBranch = 'their-branch';
      const ourFile = 'current contents';
      const theirFile = 'incoming contents';

      stage.git(['checkout', '-b', theirBranch]);
      stage.writeFile('test.txt', theirFile);
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      stage.git(['checkout', '-']);
      stage.writeFile('test.txt', ourFile);
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      // command throws but leaves the repository in merge state
      assert.throws(() => stage.git(['merge', theirBranch]));

      assert.deepEqual(stage.readFile('test.txt').trim().split('\n'), [
        '<<<<<<< HEAD',
        ourFile,
        '=======',
        theirFile,
        `>>>>>>> ${theirBranch}`,
      ]);

      assert.equal(stage.git(['status', '--porcelain']), 'AA test.txt\n');

      stage.writeFile('test.txt', theirFile);
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status']);
      const oldStatusPorcelain = stage.git(['status', '--porcelain']);
      assert.doesNotThrow(() => stage.prepare());
      const newStatus = stage.git(['status']);
      const newStatusPorcelain = stage.git(['status', '--porcelain']);

      assert.notEqual(newStatus, oldStatus);
      assert.equal(newStatusPorcelain, oldStatusPorcelain);
      assert.equal(newStatusPorcelain, 'M  test.txt\n');
    });
  });

  describe('::run', () => {
    it('runs task', async () => {
      await assert.doesNotReject(async () => stage.run([TASK_EXIT_0]));
    });

    it('throws if task fails', async () => {
      await assert.rejects(async () => stage.run([TASK_EXIT_1]));
    });
  });

  describe('::merge', () => {
    it('does nothing if no backup stash exists and no changes were made by tasks', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['stash', '-m', 'not a backup stash']);

      const oldStatus = stage.git(['status', '-z']);
      const oldStashList = stage.git(['stash', 'list']);
      stage.merge();
      const newStatus = stage.git(['status', '-z']);
      const newStashList = stage.git(['stash', 'list']);

      assert.equal(newStatus, oldStatus);
      assert.equal(newStashList, oldStashList);
    });

    it('adds task modifications to index', async () => {
      stage.writeFile('test.txt', 'old content');
      stage.git(['add', 'test.txt']);

      // pretend that this was done by a task
      stage.writeFile('test.txt', 'new content');

      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt\n');
      assert.equal(stage.readFile('test.txt'), 'new content');
    });

    it('adds task additions to index', async () => {
      // pretend that this was done by a task
      stage.writeFile('test.txt', 'new content');

      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt\n');
      assert.equal(stage.readFile('test.txt'), 'new content');
    });

    it('adds task deletions to index', async () => {
      stage.writeFile('test.txt', 'old content');
      stage.git(['add', 'test.txt']);

      // pretend that this was done by a task
      stage.rm('test.txt');

      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), '');
    });

    it('restores unstaged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('maintains staged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores unstaged modifications', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('maintains staged modifications', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores unstaged modifications to staged files', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'new contents');
    });

    it('restores unstaged deletions', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('maintains staged deletions', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('todo');

    it('merges unstaged deletions', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');

      assert.equal(stage.git(['status', '--porcelain']), ' D test.txt\n');

      stage.prepare();
      assert.equal(stage.readFile('test.txt'), 'old contents');
      stage.writeFile('test.txt', 'new contents');
      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), 'MD test.txt\n');
    });

    it('restores merge status', async () => {
      const theirBranch = 'their-branch';
      const ourFile = 'current contents';
      const theirFile = 'incoming contents';

      stage.git(['checkout', '-b', theirBranch]);
      stage.writeFile('test.txt', theirFile);
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      stage.git(['checkout', '-']);
      stage.writeFile('test.txt', ourFile);
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      // command throws but leaves the repository in merge state
      assert.throws(() => stage.git(['merge', theirBranch]));

      assert.deepEqual(stage.readFile('test.txt').trim().split('\n'), [
        '<<<<<<< HEAD',
        ourFile,
        '=======',
        theirFile,
        `>>>>>>> ${theirBranch}`,
      ]);

      assert.equal(stage.git(['status', '--porcelain']), 'AA test.txt\n');

      stage.writeFile('test.txt', theirFile);
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status']);
      const oldStatusPorcelain = stage.git(['status', '--porcelain']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status']);
      const newStatusPorcelain = stage.git(['status', '--porcelain']);

      assert.equal(newStatus, oldStatus);
      assert.equal(newStatusPorcelain, oldStatusPorcelain);
      assert.equal(newStatusPorcelain, 'M  test.txt\n');
    });

    it('throws if expected backup stash is not found', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();
      stage.git(['stash', 'clear']);

      const oldStatus = stage.git(['status', '-z']);
      assert.throws(() => stage.merge(), /missing backup stash/);
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });

    it('drops backup stash', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.merge();

      assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });
  });

  describe('::revert', () => {
    it('does nothing if no backup stash exists and no files are changed by tasks', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['stash', '-m', 'not a backup stash']);

      const oldStatus = stage.git(['status', '-z']);
      const oldStashList = stage.git(['stash', 'list']);
      stage.revert();
      const newStatus = stage.git(['status', '-z']);
      const newStashList = stage.git(['stash', 'list']);

      assert.equal(newStatus, oldStatus);
      assert.equal(newStashList, oldStashList);
    });

    it('deletes changes made by tasks', async () => {
      const oldStatus = stage.git(['status', '-z']);
      const oldStashList = stage.git(['stash', 'list']);
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.revert();
      const newStatus = stage.git(['status', '-z']);
      const newStashList = stage.git(['stash', 'list']);

      assert.equal(newStatus, oldStatus);
      assert.equal(newStashList, oldStashList);
    });

    it('deletes changes not present in backup stash', async () => {
      stage.writeFile('test.txt', 'old contents');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.writeFile('test.txt', 'new contents');
      stage.writeFile('new_test.txt');
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });

    it('restores new files in working tree', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores new files in index', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores unstaged changes in working tree', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores staged changes in index', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores changes to partially staged files in index and working tree', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'new contents');
    });

    it('restores unstaged deleted files in working tree', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores staged deleted files in index', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores merge status', async () => {
      const theirBranch = 'their-branch';
      const ourFile = 'current contents';
      const theirFile = 'incoming contents';

      stage.git(['checkout', '-b', theirBranch]);
      stage.writeFile('test.txt', theirFile);
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      stage.git(['checkout', '-']);
      stage.writeFile('test.txt', ourFile);
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      // command throws but leaves the repository in merge state
      assert.throws(() => stage.git(['merge', theirBranch]));

      assert.deepEqual(stage.readFile('test.txt').trim().split('\n'), [
        '<<<<<<< HEAD',
        ourFile,
        '=======',
        theirFile,
        `>>>>>>> ${theirBranch}`,
      ]);

      assert.equal(stage.git(['status', '--porcelain']), 'AA test.txt\n');

      stage.writeFile('test.txt', theirFile);
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status']);
      const oldStatusPorcelain = stage.git(['status', '--porcelain']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status']);
      const newStatusPorcelain = stage.git(['status', '--porcelain']);

      assert.equal(newStatus, oldStatus);
      assert.equal(newStatusPorcelain, oldStatusPorcelain);
      assert.equal(newStatusPorcelain, 'M  test.txt\n');
    });

    it('drops backup stash', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.revert();

      assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('throws if expected backup stash is not found', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();
      stage.git(['stash', 'clear']);

      const oldStatus = stage.git(['status', '-z']);
      assert.throws(() => stage.revert(), /missing backup stash/);
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });
  });
});
