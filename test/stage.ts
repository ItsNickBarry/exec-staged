import {
  BACKUP_STASH_MESSAGE,
  DEFAULT_CONFIG_ENTRY,
  INTERPOLATION_IDENTIFIER,
  STAGED_CHANGES_COMMIT_MESSAGE,
} from '../src/lib/constants';
import { TASK_EXIT_0, TASK_EXIT_1, TASK_RM_FILES } from './fixtures/tasks';
import { TestStage } from './fixtures/test_stage';
import { execaSync } from 'execa';
import assert from 'node:assert';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';

describe('Stage', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = TestStage.create();
  });

  describe('::check', () => {
    it('throws if git is not present', async () => {
      // override git to use an empty PATH so the git binary cannot be found
      stage.git = (args: string[]) => {
        const { stdout } = execaSync({ cwd: stage.cwd, env: { PATH: '' } })(
          'git',
          args,
        );
        return stdout;
      };

      assert.throws(() => stage.check(), /git installation not found/);
    });

    it('throws if git version is unsupported', async () => {
      stage.writeFile('.fake-bin/git', '#!/bin/sh\necho "git version 2.12.0"');
      stage.chmod('.fake-bin/git', 0o755);

      // override git to prefer the fake script that reports an old version
      stage.git = (args: string[]) => {
        const { stdout } = execaSync({
          cwd: stage.cwd,
          env: {
            ...process.env,
            PATH: `${path.resolve(stage.cwd, '.fake-bin')}:${process.env.PATH}`,
          },
        })('git', args);
        return stdout;
      };

      assert.throws(() => stage.check(), /unsupported git version/);
    });

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

    it('throws if temporary commit from previous run is present', async () => {
      stage.git([
        'commit',
        '--allow-empty',
        '-m',
        STAGED_CHANGES_COMMIT_MESSAGE,
      ]);

      assert.throws(() => stage.check(), /unexpected temporary commit/);
    });

    it('throws if git directory is a symlink pointing inside repository', async () => {
      stage.rename('.git', '.git-symlinked');
      stage.symlink('.git-symlinked', '.git');

      assert.throws(
        () => stage.check(),
        /git directory is a symlink pointing to a location within the repository/,
      );
    });
  });

  describe('::prepare', () => {
    it('does not create a stash if no changes are in index or working tree', async () => {
      stage.prepare();

      assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash with unstaged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash with staged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash with unstaged modifications', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash with staged modifications', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash with unstaged modifications to staged file', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash with unstaged deletions', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash with staged deletions', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('creates a stash with renamed files', async () => {
      stage.writeFile('test.old', 'contents');
      stage.git(['add', 'test.old']);
      stage.git(['commit', '-m', 'add file']);
      stage.rename('test.old', 'test.new');
      stage.git(['add', 'test.old', 'test.new']);

      stage.prepare();

      assert(stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('hides unstaged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), '');
    });

    it('hides unstaged modifications', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add files']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), '');
    });

    it('hides unstaged modifications to staged file', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      assert.equal(stage.git(['status', '--porcelain']), 'AM test.txt');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt');
    });

    it('hides unstaged deletions (restores them)', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');

      assert.equal(stage.git(['status', '--porcelain']), ' D test.txt');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), '');
    });

    it('does not hide staged additions', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt');
    });

    it('does not hide staged modifications', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add files']);
      stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      assert.equal(stage.git(['status', '--porcelain']), 'M  test.txt');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'M  test.txt');
    });

    it('does not hide staged deletions', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      assert.equal(stage.git(['status', '--porcelain']), 'D  test.txt');

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'D  test.txt');
    });

    it('does not hide renamed files', async () => {
      stage.writeFile('test.old', 'contents');
      stage.git(['add', 'test.old']);
      stage.git(['commit', '-m', 'add file']);
      stage.rename('test.old', 'test.new');
      stage.git(['add', 'test.old', 'test.new']);

      assert.equal(
        stage.git(['status', '--porcelain']),
        'R  test.old -> test.new',
      );
      assert.equal(
        stage.git(['status', '--porcelain', '--no-renames']),
        'A  test.new\nD  test.old',
      );

      stage.prepare();

      assert.equal(
        stage.git(['status', '--porcelain']),
        'R  test.old -> test.new',
      );
      assert.equal(
        stage.git(['status', '--porcelain', '--no-renames']),
        'A  test.new\nD  test.old',
      );
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

      assert.equal(newStatus, oldStatus);
      assert.equal(newStatusPorcelain, oldStatusPorcelain);
      assert.equal(newStatusPorcelain, 'AA test.txt');
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

      assert.equal(stage.git(['status', '--porcelain']), 'AA test.txt');

      stage.writeFile('test.txt', theirFile);
      stage.git(['add', 'test.txt']);

      const oldStatus = stage.git(['status']);
      const oldStatusPorcelain = stage.git(['status', '--porcelain']);
      assert.doesNotThrow(() => stage.prepare());
      const newStatus = stage.git(['status']);
      const newStatusPorcelain = stage.git(['status', '--porcelain']);

      assert.notEqual(newStatus, oldStatus);
      assert.equal(newStatusPorcelain, oldStatusPorcelain);
      assert.equal(newStatusPorcelain, 'M  test.txt');
    });
  });

  describe('::run', () => {
    it('runs task', async () => {
      await assert.doesNotReject(async () =>
        stage.run([{ ...DEFAULT_CONFIG_ENTRY, task: TASK_EXIT_0 }]),
      );
    });

    it('throws if task fails', async () => {
      await assert.rejects(async () =>
        stage.run([{ ...DEFAULT_CONFIG_ENTRY, task: TASK_EXIT_1 }]),
      );
    });

    it('interpolates files into command if command includes interpolation token', async () => {
      stage.writeFile('test.js');
      stage.git(['add', 'test.js']);

      stage.prepare();
      await stage.run([{ ...DEFAULT_CONFIG_ENTRY, task: TASK_RM_FILES }]);

      assert.throws(() => stage.readFile('test.js'), /ENOENT/);
    });

    it('interpolates old and new versions of renamed files separately', async () => {
      stage.writeFile('test.old', 'contents');
      stage.git(['add', 'test.old']);
      stage.git(['commit', '-m', 'add file']);
      stage.rename('test.old', 'test.new');
      stage.git(['add', 'test.old', 'test.new']);

      stage.prepare();

      await assert.doesNotReject(async () =>
        stage.run([
          {
            ...DEFAULT_CONFIG_ENTRY,
            task: `${TASK_EXIT_1} ${INTERPOLATION_IDENTIFIER}`,
            diff: 'R',
          },
        ]),
      );

      await assert.rejects(async () =>
        stage.run([
          {
            ...DEFAULT_CONFIG_ENTRY,
            task: `${TASK_EXIT_1} ${INTERPOLATION_IDENTIFIER}`,
            diff: 'D',
          },
        ]),
      );

      await assert.rejects(async () =>
        stage.run([
          {
            ...DEFAULT_CONFIG_ENTRY,
            task: `${TASK_EXIT_1} ${INTERPOLATION_IDENTIFIER}`,
            diff: 'A',
          },
        ]),
      );
    });

    it('filters interpolated files with diff filter', async () => {
      stage.writeFile('test-M.js', 'old contents');
      stage.git(['add', 'test-M.js']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test-A.js');
      stage.writeFile('test-M.js', 'new contents');
      stage.git(['add', 'test-A.js', 'test-M.js']);

      stage.prepare();
      await stage.run([
        { ...DEFAULT_CONFIG_ENTRY, task: TASK_RM_FILES, diff: 'A' },
      ]);

      assert.throws(() => stage.readFile('test-A.js'), /ENOENT/);
      assert.doesNotThrow(() => stage.readFile('test-M.js'));
    });

    it('filters interpolated files with glob filter', async () => {
      stage.writeFile('test.js');
      stage.writeFile('test.ts');
      stage.git(['add', 'test.js', 'test.ts']);

      stage.prepare();
      await stage.run([
        { ...DEFAULT_CONFIG_ENTRY, task: TASK_RM_FILES, glob: '*.js' },
      ]);

      assert.throws(() => stage.readFile('test.js'), /ENOENT/);
      assert.doesNotThrow(() => stage.readFile('test.ts'));
    });

    it('uses default diff filter', async () => {
      stage.writeFile('test-M.js', 'old contents');
      stage.git(['add', 'test-M.js']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test-A.js');
      stage.writeFile('test-M.js', 'new contents');
      stage.git(['add', 'test-A.js', 'test-M.js']);

      stage.prepare();
      await stage.run([{ ...DEFAULT_CONFIG_ENTRY, task: TASK_RM_FILES }]);

      assert.throws(() => stage.readFile('test-A.js'), /ENOENT/);
      assert.throws(() => stage.readFile('test-M.js'), /ENOENT/);
    });

    it('uses default glob filter', async () => {
      stage.writeFile('test.js');
      stage.writeFile('subdirectory/test.js');
      stage.writeFile('.test.js');
      stage.git(['add', 'test.js', 'subdirectory/test.js', '.test.js']);

      stage.prepare();
      await stage.run([{ ...DEFAULT_CONFIG_ENTRY, task: TASK_RM_FILES }]);

      assert.throws(() => stage.readFile('test.js'), /ENOENT/);
      assert.throws(() => stage.readFile('subdirectory/test.js'), /ENOENT/);
      assert.throws(() => stage.readFile('.test.js'), /ENOENT/);
    });

    it('does not run task if command includes interpolation token and no files match', async () => {
      await assert.doesNotReject(async () =>
        stage.run([
          {
            ...DEFAULT_CONFIG_ENTRY,
            task: `${TASK_EXIT_1} ${INTERPOLATION_IDENTIFIER}`,
          },
        ]),
      );
    });
  });

  describe('::merge', () => {
    it('does nothing if no backup stash exists and no changes were made by tasks', async () => {
      stage.prepare();

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

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt');
      assert.equal(stage.readFile('test.txt'), 'new content');
    });

    it('adds task additions to index', async () => {
      // pretend that this was done by a task
      stage.writeFile('test.txt', 'new content');

      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), 'A  test.txt');
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

    it('maintains renamed files', async () => {
      stage.writeFile('test.old', 'contents');
      stage.git(['add', 'test.old']);
      stage.git(['commit', '-m', 'add file']);
      stage.rename('test.old', 'test.new');
      stage.git(['add', 'test.old', 'test.new']);

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

      assert.equal(stage.git(['status', '--porcelain']), ' D test.txt');

      stage.prepare();
      assert.equal(stage.readFile('test.txt'), 'old contents');
      stage.writeFile('test.txt', 'new contents');
      stage.merge();

      assert.equal(stage.git(['status', '--porcelain']), 'MD test.txt');
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

      assert.equal(stage.git(['status', '--porcelain']), 'AA test.txt');

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
      assert.equal(newStatusPorcelain, 'M  test.txt');
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

    it('resets temporary staged changes commit', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.merge();

      assert(!stage.git(['log']).includes(STAGED_CHANGES_COMMIT_MESSAGE));
    });
  });

  describe('::revert', () => {
    it('does nothing if no backup stash exists and no files are changed by tasks', async () => {
      stage.prepare();

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

    it('reverts additions made by tasks', async () => {
      stage.prepare();

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

    it('reverts deletions made by tasks', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.rm('test.txt');
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });

    it('reverts modifications made by tasks', async () => {
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

    it('restores unstaged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores staged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
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
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
    });

    it('restores staged modifications', async () => {
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

    it('restores staged and unstaged changes to partially staged file', async () => {
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

    it('restores unstaged deletions (deletes them)', async () => {
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

    it('restores staged deletions (deletes them)', async () => {
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

    it('restores renamed files', async () => {
      stage.writeFile('test.old', 'contents');
      stage.git(['add', 'test.old']);
      stage.git(['commit', '-m', 'add file']);
      stage.rename('test.old', 'test.new');
      stage.git(['add', 'test.old', 'test.new']);

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

      assert.equal(stage.git(['status', '--porcelain']), 'AA test.txt');

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
      assert.equal(newStatusPorcelain, 'M  test.txt');
    });

    it('drops backup stash', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.revert();

      assert(!stage.git(['stash', 'list']).includes(BACKUP_STASH_MESSAGE));
    });

    it('resets temporary staged changes commit', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.revert();

      assert(!stage.git(['log']).includes(STAGED_CHANGES_COMMIT_MESSAGE));
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
