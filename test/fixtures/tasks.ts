import { INTERPOLATION_IDENTIFIER } from '../../src/lib/constants';
import { TestStage } from './test_stage';
import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

export const TASK_ASSERT_CHANGES = `bash -c '[ -z "$(git status --porcelain | grep "^..")" ] && exit 1 || exit 0'`;
export const TASK_ASSERT_NO_CHANGES = `bash -c '[ -z "$(git status --porcelain | grep "^..")" ] && exit 0 || exit 1'`;
export const TASK_ASSERT_NO_UNSTAGED_CHANGES = `bash -c '[ -z "$(git status --porcelain | grep "^.[^ ]")" ] && exit 0 || exit 1'`;
export const TASK_EXIT_0 = 'bash -c "exit 0"';
export const TASK_EXIT_1 = 'bash -c "exit 1"';
export const TASK_KNIP = 'knip';
export const TASK_PRETTIER_WRITE_ALL = 'prettier --write .';
export const TASK_RM_FILES = `rm ${INTERPOLATION_IDENTIFIER}`;
export const TASK_SLEEP = 'sleep 1';

// skip tests if this file is loaded as an import
if (process.argv[1] === import.meta.filename) {
  describe('task fixtures', () => {
    let stage: TestStage;

    beforeEach(async () => {
      stage = TestStage.create();
    });

    describe('TASK_ASSERT_CHANGES', () => {
      it('throws with no changes in index or working tree', async () => {
        assert.throws(() => stage.spawnSync(TASK_ASSERT_CHANGES));
      });

      it('does not throw with untracked files', async () => {
        stage.writeFile('test.txt');

        assert.doesNotThrow(() => stage.spawnSync(TASK_ASSERT_CHANGES));
      });

      it('does not throw with unstaged changes to tracked files', async () => {
        stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add files']);
        stage.writeFile('test.txt', 'new contents');

        assert.doesNotThrow(() => stage.spawnSync(TASK_ASSERT_CHANGES));
      });

      it('does not throw with partially staged changes to tracked files', async () => {
        stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        stage.writeFile('test.txt', 'new contents');

        assert.doesNotThrow(() => stage.spawnSync(TASK_ASSERT_CHANGES));
      });

      it('does not throw with unstaged deletions', async () => {
        stage.writeFile('test.txt');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add file']);
        stage.rm('test.txt');

        assert.doesNotThrow(() => stage.spawnSync(TASK_ASSERT_CHANGES));
      });

      it('does not throw with staged deletions', async () => {
        stage.writeFile('test.txt');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add file']);
        stage.rm('test.txt');
        stage.git(['add', 'test.txt']);

        assert.doesNotThrow(() => stage.spawnSync(TASK_ASSERT_CHANGES));
      });
    });

    describe('TASK_ASSERT_NO_CHANGES', () => {
      it('does not throw with no changes in index or working tree', async () => {
        assert.doesNotThrow(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with untracked files', async () => {
        stage.writeFile('test.txt');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with unstaged changes to tracked files', async () => {
        stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add files']);
        stage.writeFile('test.txt', 'new contents');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with partially staged changes to tracked files', async () => {
        stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        stage.writeFile('test.txt', 'new contents');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with unstaged deletions', async () => {
        stage.writeFile('test.txt');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add file']);
        stage.rm('test.txt');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with staged deletions', async () => {
        stage.writeFile('test.txt');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add file']);
        stage.rm('test.txt');
        stage.git(['add', 'test.txt']);

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });
    });

    describe('TASK_ASSERT_NO_UNSTAGED_CHANGES', () => {
      it('does not throw with no changes in index or working tree', async () => {
        assert.doesNotThrow(() =>
          stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES),
        );
      });

      it('does not throw with staged changes', async () => {
        stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);

        assert.doesNotThrow(() =>
          stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES),
        );

        stage.git(['commit', '-m', 'add files']);
        stage.writeFile('test.txt', 'new contents');
        stage.git(['add', 'test.txt']);

        assert.doesNotThrow(() =>
          stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES),
        );
      });

      it('throws with untracked files', async () => {
        stage.writeFile('test.txt');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES));
      });

      it('throws with unstaged changes to tracked files', async () => {
        stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add files']);
        stage.writeFile('test.txt', 'new contents');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES));
      });

      it('throws with partially staged changes to tracked files', async () => {
        stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        stage.writeFile('test.txt', 'new contents');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES));
      });

      it('throws with unstaged deletions', async () => {
        stage.writeFile('test.txt');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add file']);
        stage.rm('test.txt');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES));
      });
    });

    describe('TASK_EXIT_0', () => {
      it('does not throw', async () => {
        assert.doesNotThrow(() => stage.spawnSync(TASK_EXIT_0));
      });
    });

    describe('TASK_EXIT_1', () => {
      it('throws', async () => {
        assert.throws(() => stage.spawnSync(TASK_EXIT_1));
      });
    });

    describe('TASK_KNIP', () => {
      it('lints project with knip', async () => {
        assert.doesNotThrow(() => stage.spawnSync(TASK_KNIP));
        // use `index.js` as file so that knip recognizes it as an entry without configuration
        stage.writeFile('index.js', `require('unknown-package')`);
        assert.throws(() => stage.spawnSync(TASK_KNIP));
      });
    });

    describe('TASK_PRETTIER_WRITE', () => {
      it('modifies unformatted files', async () => {
        stage.writeFile('test.js', `export default 'test string'`);
        assert.doesNotThrow(() => stage.spawnSync(TASK_PRETTIER_WRITE_ALL));
        assert.equal(
          stage.readFile('test.js'),
          `export default "test string";\n`,
        );
      });
    });

    describe('TASK_RM_FILES', () => {
      it('deletes matching files', async () => {
        // interpolation does not take place in this context, so we use a file
        // with the same name as the interpolation filter
        stage.writeFile(INTERPOLATION_IDENTIFIER);
        stage.writeFile('test.js');

        assert.doesNotThrow(() => stage.spawnSync(TASK_RM_FILES));

        assert.throws(() => stage.readFile(INTERPOLATION_IDENTIFIER), /ENOENT/);
        assert.doesNotThrow(() => stage.readFile('test.js'));
      });
    });

    describe('TASK_SLEEP', () => {
      it('does not throw', async () => {
        assert.doesNotThrow(() => stage.spawnSync(TASK_SLEEP));
      });

      it('sleeps for one second', async () => {
        const startedAt = new Date().getTime();
        stage.spawnSync(TASK_SLEEP);
        const endedAt = new Date().getTime();

        assert(endedAt - startedAt >= 1000);
      });
    });
  });
}
