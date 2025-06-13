import { loadConfig, parseTasks } from '../src/lib/config.js';
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
    assert.deepEqual(await loadConfig(cwd), {});
  });
});

describe('parseTasks', () => {
  it('parses string', async () => {
    const tasks = 'task';
    assert.deepStrictEqual(await parseTasks(tasks), ['task']);
  });

  it('parses string array', async () => {
    const tasks = ['task'];
    assert.deepStrictEqual(await parseTasks(tasks), ['task']);
  });

  it('parses function returning string', async () => {
    const tasks = () => 'task';
    assert.deepStrictEqual(await parseTasks(tasks), ['task']);
  });

  it('parses function returning string array', async () => {
    const tasks = () => ['task'];
    assert.deepStrictEqual(await parseTasks(tasks), ['task']);
  });

  it('parses async function returning string', async () => {
    const tasks = async () => 'task';
    assert.deepStrictEqual(await parseTasks(tasks), ['task']);
  });

  it('parses nested functions', async () => {
    const tasks = () => () => () => 'task';
    assert.deepStrictEqual(await parseTasks(tasks), ['task']);
  });

  it('parses complex structure', async () => {
    const tasks = [
      () => 'a',
      async () => [() => 'b'],
      ['c', 'd', 'e'],
      'f',
      [() => 'g', () => 'h'],
    ];

    const expected = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    assert.deepStrictEqual(await parseTasks(tasks), expected);
  });
});
