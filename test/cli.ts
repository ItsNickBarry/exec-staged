import {
  BACKUP_WORKING_TREE_REF,
  stageLifecycleMessages,
} from '../src/lib/constants';
import {
  TASK_APPEND_FILES,
  TASK_EXIT_0,
  TASK_EXIT_1,
  TASK_SLEEP,
} from './fixtures/tasks';
import { TestStage } from './fixtures/test_stage';
import assert from 'node:assert';
import child_process, { type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

const BIN = path.resolve(import.meta.dirname, '../dist/bin/cli.js');

// wait until the subprocess reports that tasks are running; resolves false if
// the subprocess exits first
const waitForTasks = (child: ChildProcess) =>
  new Promise<boolean>((resolve) => {
    let output = '';

    child.stdout!.on('data', (data) => {
      output += data;
      if (output.includes(stageLifecycleMessages.run)) resolve(true);
    });

    child.once('close', () => resolve(false));
  });

const installPreCommitHook = (stage: TestStage, task: string) => {
  // wrap in single quotes for sh, escaping any single quotes within
  const quote = (arg: string) => `'${arg.replaceAll("'", `'\\''`)}'`;

  stage.writeFile(
    '.git/hooks/pre-commit',
    `#!/bin/sh\nexec node ${quote(BIN)} ${quote(task)}\n`,
  );
  stage.chmod('.git/hooks/pre-commit', 0o755);
};

describe('CLI', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = TestStage.create();
  });

  it('returns exit code 0 on success', async () => {
    const child = child_process.spawn('node', [BIN, TASK_EXIT_0], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 0);
  });

  it('returns exit code 1 on failure', async () => {
    const child = child_process.spawn('node', [BIN, TASK_EXIT_1], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 1);
  });

  it('reverts state on process interrupt', async () => {
    stage.writeFile('test.txt');

    const oldStatus = stage.git(['status', '-z']);

    const child = child_process.spawn('node', [BIN, TASK_SLEEP], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    assert(await waitForTasks(child));
    assert(stage.hasBackup());
    // assert that kill signal was received before process ended normally
    assert(child.kill());

    await closed;

    const newStatus = stage.git(['status', '-z']);

    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, 'SIGTERM');
    assert.equal(newStatus, oldStatus);
    assert(!stage.hasBackup());
  });

  it('reverts state on process interrupt if repository has no commits', async () => {
    // Replace the default repository with a freshly initialized one. This
    // tests a special case where the repository has no commits, so HEAD
    // does not resolve to a commit.
    stage.rm('.git');
    stage.git(['init']);

    stage.writeFile('test.txt');

    const oldStatus = stage.git(['status', '-z']);

    const child = child_process.spawn('node', [BIN, TASK_SLEEP], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    assert(await waitForTasks(child));
    assert(stage.hasBackup());
    // assert that kill signal was received before process ended normally
    assert(child.kill());

    await closed;

    const newStatus = stage.git(['status', '-z']);

    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, 'SIGTERM');
    assert.equal(newStatus, oldStatus);
    assert(!stage.hasBackup());
    // assert that HEAD still does not resolve to a commit
    assert.throws(() => stage.git(['rev-parse', '--verify', '-q', 'HEAD']));
  });

  it('reverts state on process interrupt during prepare stage', async () => {
    // pause the prepare stage after the backup is created, so that the interrupt
    // is received before the prepare stage completes
    stage.writeFile(
      '.git/hooks/reference-transaction',
      [
        '#!/bin/sh',
        '[ "$1" = committed ] || exit 0',
        'while read -r old new ref; do',
        `  if [ "$ref" = '${BACKUP_WORKING_TREE_REF}' ] && [ "$new" != "\${new#*[!0]}" ]; then`,
        '    sleep 1',
        '  fi',
        'done',
      ].join('\n'),
    );
    stage.chmod('.git/hooks/reference-transaction', 0o755);

    stage.writeFile('test.txt');

    const oldStatus = stage.git(['status', '-z']);

    const child = child_process.spawn('node', [BIN, TASK_SLEEP], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    let output = '';
    child.stdout.on('data', (data) => (output += data));

    while (!stage.hasBackup() && child.exitCode === null) {
      await sleep(10);
    }

    // assert that the prepare stage has started but not completed
    assert(output.includes(stageLifecycleMessages.prepare));
    assert(!output.includes(stageLifecycleMessages.run));
    // assert that kill signal was received before process ended normally
    assert(child.kill());

    await closed;

    const newStatus = stage.git(['status', '-z']);

    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, 'SIGTERM');
    assert.equal(newStatus, oldStatus);
    assert(!stage.hasBackup());
  });

  it('loads config from file', async () => {
    const stage = TestStage.create();
    stage.writeFile(
      'exec-staged.config.ts',
      `export default ['${TASK_EXIT_1}'];`,
    );

    const child = child_process.spawn('node', [BIN], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 1);
  });

  it('reports error and returns exit code 1 if config is invalid', async () => {
    stage.writeFile('exec-staged.config.ts', `export default [{}];`);

    const child = child_process.spawn('node', [BIN], {
      cwd: stage.cwd,
    });

    let output = '';
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 1);
    assert(output.includes('invalid config'));
  });

  it('reports error and returns exit code 1 if config throws while loading', async () => {
    // on Node.js 24 releases before 24.5.0, require() of an ES module whose
    // import() failed throws ERR_INTERNAL_ASSERTION, which cosmiconfig reports
    // instead of the original error, causing this test to fail
    // see https://github.com/nodejs/node/pull/58957
    stage.writeFile(
      'exec-staged.config.ts',
      `throw new Error('config load test error');`,
    );

    const child = child_process.spawn('node', [BIN], {
      cwd: stage.cwd,
    });

    let output = '';
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 1);
    assert(output.includes('config load test error'));
  });

  it('recovers from failed run', async () => {
    stage.writeFile('test.txt', 'staged contents');
    stage.git(['add', 'test.txt']);
    stage.writeFile('test.txt', 'unstaged contents');

    const oldStatus = stage.git(['status', '-z']);

    stage.prepare();

    const child = child_process.spawn('node', [BIN, 'recover'], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 0);

    const newStatus = stage.git(['status', '-z']);
    assert.equal(newStatus, oldStatus);
    assert(!stage.hasBackup());
  });

  it('returns exit code 0 when nothing to recover', async () => {
    const child = child_process.spawn('node', [BIN, 'recover'], {
      cwd: stage.cwd,
    });

    const closed = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    await closed;

    assert.equal(child.exitCode, 0);
  });

  it('runs tasks against staged files via pre-commit hook', async () => {
    installPreCommitHook(stage, TASK_APPEND_FILES);

    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);

    stage.git(['commit', '-m', 'add file']);

    assert.equal(stage.git(['log', '-1', '--format=%s']), 'add file');
    assert.equal(
      stage.git(['show', '--name-only', '--format=', 'HEAD']),
      'test.txt',
    );
    assert.equal(stage.git(['show', 'HEAD:test.txt']), 'modified');
    assert.equal(stage.git(['status', '--porcelain']), '');
  });

  it('runs tasks against staged files in initial commit via pre-commit hook', async () => {
    // Replace the default repository with a freshly initialized one. This
    // tests a special case where the repository has no commits, so HEAD
    // does not resolve to a commit.
    stage.rm('.git');
    stage.git(['init']);

    installPreCommitHook(stage, TASK_APPEND_FILES);

    stage.writeFile('test.txt');
    stage.git(['add', 'test.txt']);

    stage.git(['commit', '-m', 'initial commit']);

    assert.equal(stage.git(['log', '--format=%s']), 'initial commit');
    assert.equal(
      stage.git(['show', '--name-only', '--format=', 'HEAD']),
      'test.txt',
    );
    assert.equal(stage.git(['show', 'HEAD:test.txt']), 'modified');
    assert.equal(stage.git(['status', '--porcelain']), '?? package.json');
  });
});
