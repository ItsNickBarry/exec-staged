import { loadConfig, resolveConfig } from '../src/lib/config.js';
import { DEFAULT_CONFIG_ENTRY } from '../src/lib/constants.js';
import { TestStage } from './fixtures/test_stage.js';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('loadConfig', () => {
  it('returns config from exec-staged.config.js', async () => {
    const { cwd } = TestStage.create();
    await fs.promises.writeFile(
      path.resolve(cwd, 'exec-staged.config.js'),
      `export default { '*': "echo 'task'" };`,
    );
    assert.deepEqual(await loadConfig(cwd), { '*': "echo 'task'" });
  });

  it('returns config from .exec-stagedrc.json', async () => {
    const { cwd } = TestStage.create();
    await fs.promises.writeFile(
      path.resolve(cwd, '.exec-stagedrc.json'),
      JSON.stringify({ '*': "echo 'task'" }),
    );
    assert.deepEqual(await loadConfig(cwd), { '*': "echo 'task'" });
  });

  it('returns empty config if no config is found', async () => {
    const { cwd } = TestStage.create();
    assert.deepEqual(await loadConfig(cwd), []);
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
