import pkg from '../package.json';
import { Stage } from '../src/lib/stage';
import envPaths from 'env-paths';
import fs from 'node:fs';
import path from 'node:path';
import simpleGit, { SimpleGit } from 'simple-git';

export class TestStage extends Stage {
  declare public readonly git: SimpleGit;

  public async writeFile(relativePath: string, contents: string = '') {
    const absolutePath = path.resolve(this.cwd, relativePath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, contents);
  }

  public static async create() {
    const cwd = path.resolve(envPaths(pkg.name).temp, crypto.randomUUID());

    // TODO: cleanup
    await fs.promises.mkdir(cwd, { recursive: true });

    const git = simpleGit(cwd);
    await git.init();
    await git.commit('initial commit', ['--allow-empty']);

    return new TestStage(cwd);
  }
}
