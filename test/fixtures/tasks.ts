import { TestStage } from './test_stage';
import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

export const TASK_ASSERT_NO_CHANGES = `bash -c '[ -z "$(git status -z)" ] && exit 0 || exit 1'`;
export const TASK_ASSERT_NO_UNSTAGED_CHANGES = `bash -c '[ -z "$(git status --porcelain | grep "^.[^ ]")" ] && exit 0 || exit 1'`;
export const TASK_EXIT_0 = 'bash -c "exit 0"';
export const TASK_EXIT_1 = 'bash -c "exit 1"';
export const TASK_SLEEP = 'sleep 1';

// skip tests if this file is loaded as an import
if (process.argv[1] === import.meta.filename) {
  describe('task fixtures', () => {
    let stage: TestStage;

    beforeEach(async () => {
      stage = await TestStage.create();
    });

    describe('TASK_ASSERT_NO_CHANGES', () => {
      it('does not throw with no changes in index or working tree', async () => {
        assert.doesNotThrow(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with untracked files', async () => {
        await stage.writeFile('test.txt');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with unstaged changes to tracked files', async () => {
        await stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add files']);
        await stage.writeFile('test.txt', 'new contents');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with partially staged changes to tracked files', async () => {
        await stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        await stage.writeFile('test.txt', 'new contents');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with unstaged deletions', async () => {
        await stage.writeFile('test.txt');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add file']);
        await stage.rm('test.txt');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_CHANGES));
      });

      it('throws with staged deletions', async () => {
        await stage.writeFile('test.txt');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add file']);
        await stage.rm('test.txt');
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
        await stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);

        assert.doesNotThrow(() =>
          stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES),
        );

        stage.git(['commit', '-m', 'add files']);
        await stage.writeFile('test.txt', 'new contents');
        stage.git(['add', 'test.txt']);

        assert.doesNotThrow(() =>
          stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES),
        );
      });

      it('throws with untracked files', async () => {
        await stage.writeFile('test.txt');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES));
      });

      it('throws with unstaged changes to tracked files', async () => {
        await stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add files']);
        await stage.writeFile('test.txt', 'new contents');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES));
      });

      it('throws with partially staged changes to tracked files', async () => {
        await stage.writeFile('test.txt', 'old contents');
        stage.git(['add', 'test.txt']);
        await stage.writeFile('test.txt', 'new contents');

        assert.throws(() => stage.spawnSync(TASK_ASSERT_NO_UNSTAGED_CHANGES));
      });

      it('throws with unstaged deletions', async () => {
        await stage.writeFile('test.txt');
        stage.git(['add', 'test.txt']);
        stage.git(['commit', '-m', 'add file']);
        await stage.rm('test.txt');

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

    describe('TASK_SLEEP', () => {
      it('sleeps for one second', async () => {
        const startedAt = new Date().getTime();
        stage.spawnSync(TASK_SLEEP);
        const endedAt = new Date().getTime();

        assert(endedAt - startedAt >= 1000);
      });
    });
  });
}
