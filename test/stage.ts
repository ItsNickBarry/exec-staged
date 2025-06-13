import { BACKUP_STASH_MESSAGE } from '../src/lib/constants';
import { TASK_EXIT_0, TASK_EXIT_1 } from './fixtures/tasks';
import { TestStage } from './fixtures/test_stage';
import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

describe('Stage', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = TestStage.create();
  });

  describe('::check', () => {
    it('returns error status code if backup stash from previous run is present', async () => {
      stage.writeFile('test.txt');
      stage.git(['stash', '--all', '-m', BACKUP_STASH_MESSAGE]);

      assert.throws(() => stage.check());
    });

    it('returns error status code if not git repository', async () => {
      stage.rm('.git');

      assert.throws(() => stage.check());
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
    it('does nothing if no backup stash exists and no files were modified by tasks', async () => {
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

    it('adds changes made by tasks', async () => {
      stage.writeFile('test.txt', 'old content');
      stage.git(['add', 'test.txt']);

      // pretend that this was done by a task
      stage.writeFile('test.txt', 'new content');

      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt\n');
      assert.equal(stage.readFile('test.txt'), 'new content');
    });

    it('adds new files created by tasks', async () => {
      // pretend that this was done by a task
      stage.writeFile('test.txt', 'new content');

      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt\n');
      assert.equal(stage.readFile('test.txt'), 'new content');
    });

    it('adds files deleted by tasks', async () => {
      stage.writeFile('test.txt', 'old content');
      stage.git(['add', 'test.txt']);

      // pretend that this was done by a task
      stage.rm('test.txt');

      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), '');
    });

    it('restores stashed new files in working tree', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('maintains stashed new files in index', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores stashed unstaged changes in working tree', async () => {
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

    it('maintains stashed staged changes in index', async () => {
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

    it('restores stashed changes to partially staged files in index and working tree', async () => {
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

    it('restores stashed unstaged deleted files in working tree', async () => {
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

    it('maintains stashed staged deleted files in index', async () => {
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

    it('throws if expected backup stash is not found', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();
      stage.git(['stash', 'clear']);

      const oldStatus = stage.git(['status', '-z']);
      assert.throws(() => stage.merge());
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });

    it('does not drop backup stash', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.merge();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });
  });

  describe('::revert', () => {
    it('does nothing if no backup stash exists', async () => {
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

    it('does not drop backup stash', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.revert();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('throws if expected backup stash is not found', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();
      stage.git(['stash', 'clear']);

      const oldStatus = stage.git(['status', '-z']);
      assert.throws(() => stage.revert());
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });
  });

  describe('::clean', () => {
    it('does nothing if no backup stash exists', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['stash', '-m', 'not a backup stash']);

      const oldStatus = stage.git(['status', '-z']);
      const oldStashList = stage.git(['stash', 'list']);
      stage.clean();
      const newStatus = stage.git(['status', '-z']);
      const newStashList = stage.git(['stash', 'list']);

      assert.equal(newStatus, oldStatus);
      assert.equal(newStashList, oldStashList);
    });

    it('drops backup stash', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.clean();

      assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });
  });
});
