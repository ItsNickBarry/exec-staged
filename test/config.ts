import { parseTasks } from '../src/lib/config.js';
import assert from 'node:assert';
import { describe, it } from 'node:test';

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
