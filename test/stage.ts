import {
  ARTIFACTS_DIRECTORY,
  BACKUP_MERGE_STATUS_TREE_REF,
  BACKUP_STAGED_TREE_REF,
  BACKUP_WORKING_TREE_REF,
  DEFAULT_CONFIG_ENTRY,
  INTERPOLATION_IDENTIFIER,
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
      stage.writeFile(
        '.fake-bin/git',
        '#!/bin/sh\necho "git version 2.21.999"',
      );
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

    it('throws if artifacts directory from previous run is present', async () => {
      stage.mkdir(`.git/${ARTIFACTS_DIRECTORY}`);

      assert.throws(() => stage.check(), /unexpected artifacts directory/);
    });

    it('throws if backup staged tree ref from previous run is present', async () => {
      stage.git([
        'update-ref',
        BACKUP_STAGED_TREE_REF,
        stage.git(['write-tree']),
      ]);

      assert.throws(() => stage.check(), /unexpected backup/);
    });

    it('throws if backup working tree ref from previous run is present', async () => {
      stage.git([
        'update-ref',
        BACKUP_WORKING_TREE_REF,
        stage.git(['write-tree']),
      ]);

      assert.throws(() => stage.check(), /unexpected backup/);
    });

    it('throws if backup merge status ref from previous run is present', async () => {
      stage.git([
        'update-ref',
        BACKUP_MERGE_STATUS_TREE_REF,
        stage.git(['write-tree']),
      ]);

      assert.throws(() => stage.check(), /unexpected backup/);
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
    it('does not create a backup if no changes are in index or working tree', async () => {
      stage.prepare();

      assert(!stage.hasBackup());
    });

    it('creates a backup with unstaged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');

      stage.prepare();

      assert(stage.hasBackup());
    });

    it('creates a backup with staged additions', async () => {
      stage.writeFile('test.txt');
      stage.writeFile('subdirectory/test.txt');
      stage.git(['add', 'test.txt', 'subdirectory/test.txt']);

      stage.prepare();

      assert(stage.hasBackup());
    });

    it('creates a backup with unstaged modifications', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert(stage.hasBackup());
    });

    it('creates a backup with staged modifications', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', 'new contents');
      stage.git(['add', 'test.txt']);

      stage.prepare();

      assert(stage.hasBackup());
    });

    it('creates a backup with unstaged modifications to staged file', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();

      assert(stage.hasBackup());
    });

    it('creates a backup with unstaged deletions', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');

      stage.prepare();

      assert(stage.hasBackup());
    });

    it('creates a backup with staged deletions', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.rm('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();

      assert(stage.hasBackup());
    });

    it('creates a backup with renamed files', async () => {
      stage.writeFile('test.old', 'contents');
      stage.git(['add', 'test.old']);
      stage.git(['commit', '-m', 'add file']);
      stage.rename('test.old', 'test.new');
      stage.git(['add', 'test.old', 'test.new']);

      stage.prepare();

      assert(stage.hasBackup());
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

    it('does not hide staged deletions of files present in working tree', async () => {
      stage.writeFile('test.txt', 'contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.git(['rm', '--cached', 'test.txt']);

      assert.equal(
        stage.git(['status', '--porcelain']),
        'D  test.txt\n?? test.txt',
      );

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'D  test.txt');
    });

    it('does not hide staged renames', async () => {
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

      // merge state is preserved
      assert.equal(newStatus, oldStatus);
      assert.equal(newStatusPorcelain, oldStatusPorcelain);
      assert.equal(newStatusPorcelain, 'M  test.txt');
    });

    it('hides unstaged changes with in-progress merge', async () => {
      const theirBranch = 'their-branch';

      stage.git(['checkout', '-b', theirBranch]);
      stage.writeFile('theirs.txt');
      stage.git(['add', 'theirs.txt']);
      stage.git(['commit', '-m', 'add file']);

      stage.git(['checkout', '-']);
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);

      stage.git(['merge', '--no-commit', theirBranch]);

      stage.writeFile('test.txt', 'new contents');
      stage.writeFile('untracked.txt');

      assert.equal(
        stage.git(['status', '--porcelain']),
        ' M test.txt\nA  theirs.txt\n?? untracked.txt',
      );

      stage.prepare();

      assert.equal(stage.git(['status', '--porcelain']), 'A  theirs.txt');
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });

    it('reverts if hiding unstaged changes fails', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.writeFile('readonly/test.txt', 'old contents');
      stage.git(['add', 'test.txt', 'readonly/test.txt']);
      stage.writeFile('test.txt', 'new contents');
      stage.writeFile('readonly/test.txt', 'new contents');

      // git can hide changes to test.txt, but fails on readonly/test.txt
      // because replacing a file requires write permission on its directory;
      // root bypasses permission checks, so the test fails if run as root
      stage.chmod('readonly', 0o555);

      try {
        const oldStatus = stage.git(['status', '-z']);
        assert.throws(() => stage.prepare());
        const newStatus = stage.git(['status', '-z']);

        assert.equal(newStatus, oldStatus);
        assert.equal(stage.readFile('test.txt'), 'new contents');
        assert(!stage.hasBackup());
      } finally {
        // allow the directory to be cleaned up
        stage.chmod('readonly', 0o755);
      }
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

    it('matches files in subdirectories when glob has no path separator (matchBase)', async () => {
      stage.writeFile('test.js');
      stage.writeFile('src/test.js');
      stage.writeFile('src/deep/test.js');
      stage.git(['add', 'test.js', 'src/test.js', 'src/deep/test.js']);

      stage.prepare();
      await stage.run([
        { ...DEFAULT_CONFIG_ENTRY, task: TASK_RM_FILES, glob: '*.js' },
      ]);

      assert.throws(() => stage.readFile('test.js'), /ENOENT/);
      assert.throws(() => stage.readFile('src/test.js'), /ENOENT/);
      assert.throws(() => stage.readFile('src/deep/test.js'), /ENOENT/);
    });

    it('does not match files in subdirectories when glob has path separator', async () => {
      stage.writeFile('test.js');
      stage.writeFile('src/test.js');
      stage.git(['add', 'test.js', 'src/test.js']);

      stage.prepare();
      await stage.run([
        { ...DEFAULT_CONFIG_ENTRY, task: TASK_RM_FILES, glob: 'src/*.js' },
      ]);

      assert.doesNotThrow(() => stage.readFile('test.js'));
      assert.throws(() => stage.readFile('src/test.js'), /ENOENT/);
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
    it('does nothing if no backup exists and no changes were made by tasks', async () => {
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

    it('restores unstaged modifications containing non-UTF-8 bytes', async () => {
      // latin1-encoded "café", which is not valid UTF-8
      const contents = Buffer.from('caf\xe9\n', 'latin1');

      stage.writeFile('test.txt', 'old contents\n');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('test.txt', contents);

      const oldStatus = stage.git(['status', '-z']);
      const oldHash = stage.git(['hash-object', 'test.txt']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);
      const newHash = stage.git(['hash-object', 'test.txt']);

      assert.equal(newStatus, oldStatus);
      assert.equal(newHash, oldHash);
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

    it('maintains staged deletions of files present in working tree', async () => {
      stage.writeFile('test.txt', 'contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.git(['rm', '--cached', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.merge();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'contents');
    });

    it('maintains staged renames', async () => {
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

    it('merges unstaged renames', async () => {
      // this test only works if staged changes are also included
      stage.writeFile('tracked.txt', 'original tracked contents');
      stage.git(['add', 'tracked.txt']);
      stage.git(['commit', '-m', 'add tracked file']);

      stage.writeFile('to-be-renamed.txt', 'original contents');
      stage.git(['add', 'to-be-renamed.txt']);
      stage.git(['commit', '-m', 'add file to be renamed']);

      stage.rename('to-be-renamed.txt', 'renamed.txt');

      stage.writeFile('tracked.txt', 'modified tracked contents');
      stage.git(['add', 'tracked.txt']);

      const oldStatus = stage.git(['status', '--porcelain']);
      assert(oldStatus.includes(' D to-be-renamed.txt'));
      assert(oldStatus.includes('?? renamed.txt'));
      assert(oldStatus.includes('M  tracked.txt'));

      stage.prepare();
      stage.merge();

      const newStatus = stage.git([
        'status',
        '--porcelain',
        '--untracked-files=all',
      ]);
      assert(
        newStatus.includes('D  to-be-renamed.txt') ||
          newStatus.includes(' D to-be-renamed.txt') ||
          newStatus.includes('MD to-be-renamed.txt'),
        'to-be-renamed.txt should show a deletion status (fix is working)',
      );
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

    it('throws if expected backup is not found', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();
      stage.git(['update-ref', '-d', BACKUP_WORKING_TREE_REF]);

      const oldStatus = stage.git(['status', '-z']);
      assert.throws(() => stage.merge(), /missing backup/);
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });

    it('deletes backup', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.merge();

      assert(!stage.hasBackup());
    });

    it('preserves index stat data of unchanged files', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('untracked.txt');

      const oldStat = stage.git(['ls-files', '--debug', 'test.txt']);
      stage.prepare();
      stage.merge();
      const newStat = stage.git(['ls-files', '--debug', 'test.txt']);

      assert.equal(
        newStat.match(/mtime: .*/)?.[0],
        oldStat.match(/mtime: .*/)?.[0],
      );
    });
  });

  describe('::revert', () => {
    it('does nothing if no backup exists and no files are changed by tasks', async () => {
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

    it('restores staged deletions of files present in working tree', async () => {
      stage.writeFile('test.txt', 'contents');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.git(['rm', '--cached', 'test.txt']);

      const oldStatus = stage.git(['status', '-z']);
      stage.prepare();
      stage.revert();
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'contents');
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

    it('deletes backup', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.revert();

      assert(!stage.hasBackup());
    });

    it('throws if expected backup is not found', async () => {
      stage.writeFile('test.txt', 'old contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'new contents');

      stage.prepare();
      stage.git(['update-ref', '-d', BACKUP_WORKING_TREE_REF]);

      const oldStatus = stage.git(['status', '-z']);
      assert.throws(() => stage.revert(), /missing backup/);
      const newStatus = stage.git(['status', '-z']);

      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'old contents');
    });

    it('preserves index stat data of unchanged files', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);
      stage.git(['commit', '-m', 'add file']);
      stage.writeFile('untracked.txt');

      const oldStat = stage.git(['ls-files', '--debug', 'test.txt']);
      stage.prepare();
      stage.revert();
      const newStat = stage.git(['ls-files', '--debug', 'test.txt']);

      assert.equal(
        newStat.match(/mtime: .*/)?.[0],
        oldStat.match(/mtime: .*/)?.[0],
      );
    });
  });

  describe('::recover', () => {
    it('does nothing if no artifacts are present', async () => {
      stage.writeFile('staged.txt', 'staged');
      stage.git(['add', 'staged.txt']);
      stage.writeFile('tracked.txt', 'original');
      stage.git(['add', 'tracked.txt']);
      stage.git(['commit', '-m', 'add tracked file']);
      stage.writeFile('tracked.txt', 'modified');
      stage.writeFile('untracked.txt', 'untracked');

      const oldStatus = stage.git(['status', '-z']);

      stage.recover();

      const newStatus = stage.git(['status', '-z']);
      assert.equal(newStatus, oldStatus);
    });

    it('restores state from backup', async () => {
      stage.writeFile('test.txt', 'staged contents');
      stage.git(['add', 'test.txt']);
      stage.writeFile('test.txt', 'unstaged contents');

      const oldStatus = stage.git(['status', '-z']);

      stage.prepare();
      stage.recover();

      const newStatus = stage.git(['status', '-z']);
      assert.equal(newStatus, oldStatus);
      assert.equal(stage.readFile('test.txt'), 'unstaged contents');
    });

    it('removes artifacts directory', async () => {
      stage.mkdir(`.git/${ARTIFACTS_DIRECTORY}`);
      stage.writeFile(`.git/${ARTIFACTS_DIRECTORY}/patch.diff`);

      stage.recover();

      assert.doesNotThrow(() => stage.check());
    });

    it('restores merge status from backup', async () => {
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

      // simulate a task's removing merge status, leaving the backup ref as the
      // only record of it
      stage.git(['merge', '--quit']);
      assert.notEqual(stage.git(['status']), oldStatus);

      // simulate failure during revert after backup deletion but before merge
      // restore
      const stagedTree = stage.git(['rev-parse', BACKUP_STAGED_TREE_REF]);
      const workingTree = stage.git(['rev-parse', BACKUP_WORKING_TREE_REF]);
      stage.git(['add', '-A']);
      stage.git(['read-tree', '-u', '--reset', workingTree]);
      stage.git(['read-tree', stagedTree]);
      stage.git(['update-ref', '-d', BACKUP_WORKING_TREE_REF]);
      stage.git(['update-ref', '-d', BACKUP_STAGED_TREE_REF]);

      stage.recover();

      const newStatus = stage.git(['status']);
      assert.equal(newStatus, oldStatus);
    });

    it('deletes backup', async () => {
      stage.writeFile('test.txt');
      stage.git(['add', 'test.txt']);

      stage.prepare();
      stage.recover();

      assert(!stage.hasBackup());
    });
  });
});
