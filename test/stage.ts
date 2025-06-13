import { BACKUP_STASH_MESSAGE } from '../src/lib/constants';
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

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash if new files are in index', async () => {
      await stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

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

  describe('::exec', () => {
    it('todo');
  });

  describe('::merge', () => {
    it('todo');
  });

  describe('::revert', () => {
    it('todo');
  });

  describe('::clean', () => {
    it('todo');
  });
});
