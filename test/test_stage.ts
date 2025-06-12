import pkg from '../package.json';
import { spawnSync } from '../src/lib/spawn';
import { Stage } from '../src/lib/stage';
import envPaths from 'env-paths';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { registerExitHandler } from 'on-process-exit';

export class TestStage extends Stage {
  declare public git: (args: string[]) => string;

  public async writeFile(relativePath: string, contents: string = '') {
    assert(!path.isAbsolute(relativePath));
    const absolutePath = path.resolve(this.cwd, relativePath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, contents);
  }

  public async rm(relativePath: string) {
    assert(!path.isAbsolute(relativePath));
    const absolutePath = path.resolve(this.cwd, relativePath);
    await fs.promises.rm(absolutePath, { recursive: true, force: true });
  }

  public spawnSync(task: string): string {
    return spawnSync(this.cwd, task);
  }

  public static async create() {
    const cwd = path.resolve(envPaths(pkg.name).temp, crypto.randomUUID());

    registerExitHandler(() => {
      fs.rmSync(cwd, { recursive: true, force: true });
    });

    await fs.promises.mkdir(cwd, { recursive: true });
    await fs.promises.writeFile(
      path.resolve(cwd, 'package.json'),
      JSON.stringify({ type: 'module' }),
    );

    const stage = new TestStage(cwd);

    stage.git(['init']);
    stage.git(['add', 'package.json']);
    stage.git(['commit', '-m', 'initial commit']);

    return stage;
  }
}
