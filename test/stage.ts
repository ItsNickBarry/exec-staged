import { BACKUP_STASH_MESSAGE } from '../src/lib/constants';
import { TASK_EXIT_0, TASK_EXIT_1 } from './fixtures/tasks';
import { TestStage } from './fixtures/test_stage';
import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

describe('Stage', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = await TestStage.create();
  });

  describe('::check', () => {
    it('returns error status code if backup stash from previous run is present', async () => {
      await stage.writeFile('test.txt');
      stage.git(['stash', '--all', '-m', BACKUP_STASH_MESSAGE]);

      assert.throws(() => stage.check());
    });

    it('returns error status code if not git repository', async () => {
      await stage.rm('.git');

      assert.throws(() => stage.check());
    });
  });

  describe('::prepare', () => {
    it('does not create a stash if no changes are in index or working tree', async () => {
      stage.prepare();

      assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if new files are in working tree', async () => {
      await stage.writeFile('test.txt');
      await stage.writeFile('subdirectory/test.txt');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if new files are in index', async () => {
      await stage.writeFile('test.txt');
      await stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if unstaged changes are in working tree', async () => {
      await stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      await stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if staged changes are in index', async () => {
      await stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      await stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if partially staged changes are in index and working tree', async () => {
      await stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      await stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if deleted files are in working tree', async () => {
      await stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      await stage.rm('test.txt');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if deleted files are in index', async () => {
      await stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      await stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });
  });

  describe('::run', () => {
    it('runs task', async () => {
      await assert.doesNotReject(async () => stage.run(TASK_EXIT_0));
    });

    it('throws if task fails', async () => {
      await assert.rejects(async () => stage.run(TASK_EXIT_1));
    });
  });

  describe('::merge', () => {
    it('todo');
  });

  describe('::revert', () => {
    it('does nothing if no backup stash exists', async () => {
      await stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
    });

    it('deletes changes not present in backup stash', async () => {
      await stage.writeFile('test.txt', 'old contents');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      await stage.writeFile('test.txt', 'new contents');
      await stage.writeFile('new_test.txt');
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
      assert.equal(await stage.readFile('test.txt'), 'old contents');
    });

    it('restores new files in working tree', async () => {
      await stage.writeFile('test.txt');
      await stage.writeFile('subdirectory/test.txt');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
    });

    it('restores new files in index', async () => {
      await stage.writeFile('test.txt');
      await stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
    });

    it('restores unstaged changes in working tree', async () => {
      await stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      await stage.writeFile('test.txt', 'new contents');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
    });

    it('restores staged changes in index', async () => {
      await stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      await stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
    });

    it('restores changes to partially staged files in index and working tree', async () => {
      await stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      await stage.writeFile('test.txt', 'new contents');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
    });

    it('restores unstaged deleted files in working tree', async () => {
      await stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      await stage.rm('test.txt');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
    });

    it('restores staged deleted files in index', async () => {
      await stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      await stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(oldStatus, newStatus);
    });
  });

  describe('::clean', () => {
    it('does nothing if no backup stash exists', async () => {
      await stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.git(['stash']);

      const oldStatus = stage.git(['status', '-z']);
      const oldStashList = stage.git(['stash', 'list']);
      stage.clean();
      const newStatus = stage.git(['status', '-z']);
      const newStashList = stage.git(['stash', 'list']);

      assert.equal(oldStatus, newStatus);
      assert.equal(oldStashList, newStashList);
    });

    it('drops backup stash', async () => {
      await stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.clean();

      assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });
  });
});
