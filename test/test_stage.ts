import pkg from '../package.json';
import { Stage } from '../src/lib/stage';
import envPaths from 'env-paths';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { registerExitHandler } from 'on-process-exit';
import simpleGit, { SimpleGit } from 'simple-git';

export class TestStage extends Stage {
  declare public readonly git: SimpleGit;

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

    const git = simpleGit(cwd);
    await git.init();
    await git.add(['package.json']);
    await git.commit('initial commit');

    return new TestStage(cwd);
  }
}
