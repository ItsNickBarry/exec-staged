import { loadConfig, resolveConfig } from '../src/lib/config.js';
import { DEFAULT_CONFIG_ENTRY } from '../src/lib/constants.js';
import { TASK_EXIT_0 } from './fixtures/tasks.js';
import { TestStage } from './fixtures/test_stage.js';
import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

describe('loadConfig', () => {
  let stage: TestStage;

  beforeEach(async () => {
    stage = TestStage.create();
  });

  it('returns config from exec-staged.config.js', async () => {
    stage.writeFile(
      'exec-staged.config.js',
      `export default ['${TASK_EXIT_0}'];`,
    );
    assert.deepEqual(await loadConfig(stage.cwd), [TASK_EXIT_0]);
  });

  it('returns config from .exec-stagedrc.json', async () => {
    stage.writeFile('.exec-stagedrc.json', JSON.stringify([TASK_EXIT_0]));
    assert.deepEqual(await loadConfig(stage.cwd), [TASK_EXIT_0]);
  });

  it('returns empty config if no config is found', async () => {
    assert.deepEqual(await loadConfig(stage.cwd), []);
  });

  it('throws if config is invalid', async () => {
    stage.writeFile('exec-staged.config.js', `export default [{}];`);

    await assert.rejects(async () => loadConfig(stage.cwd), /invalid config/);
  });
});

describe('resolveConfig', () => {
  it('parses string entry', async () => {
    const userConfig = ['task'];
    assert.deepStrictEqual(resolveConfig(userConfig), [
      { ...DEFAULT_CONFIG_ENTRY, task: 'task' },
    ]);
  });

  it('parses object entry without optional parameters', async () => {
    const userConfig = [{ task: 'task' }];
    assert.deepStrictEqual(resolveConfig(userConfig), [
      { ...DEFAULT_CONFIG_ENTRY, task: 'task' },
    ]);
  });

  it('parses object entry with optional parameters', async () => {
    const userConfig = [{ task: 'task', diff: 'diff', glob: 'glob' }];
    Object.freeze(userConfig);
    assert.deepStrictEqual(resolveConfig(userConfig), userConfig);
  });
});
