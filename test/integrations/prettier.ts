import { TASK_PRETTIER_WRITE_FILES } from '../fixtures/tasks';
import { TestStage } from '../fixtures/test_stage';
import assert from 'node:assert';
import { describe, it } from 'node:test';

describe('prettier', () => {
  it('runs against stage', async () => {
    const stage = TestStage.create();

    const uglyContents = `export default 'string'`;
    const prettyContents = `export default "string";\n`;

    stage.writeFile('test.js', uglyContents);

    assert.equal(await stage.execStaged([TASK_PRETTIER_WRITE_FILES]), true);
    assert.equal(stage.readFile('test.js'), uglyContents);

    stage.git(['add', 'test.js']);

    assert.equal(await stage.execStaged([TASK_PRETTIER_WRITE_FILES]), true);
    assert.equal(stage.readFile('test.js'), prettyContents);
  });
});
