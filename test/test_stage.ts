import pkg from '../package.json';
import { Stage } from '../src/lib/stage';
import envPaths from 'env-paths';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import simpleGit, { SimpleGit } from 'simple-git';

const testDirectories: string[] = [];

[
  'beforeExit',
  'uncaughtException',
  'unhandledRejection',
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGUSR1',
  'SIGSEGV',
  'SIGUSR2',
  'SIGTERM',
].forEach((event) =>
  process.on(event, () =>
    testDirectories.forEach((dir) =>
      fs.rmSync(dir, { recursive: true, force: true }),
    ),
  ),
);

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
    testDirectories.push(cwd);
    await fs.promises.mkdir(cwd, { recursive: true });

    const git = simpleGit(cwd);
    await git.init();
    await git.commit('initial commit', ['--allow-empty']);

    return new TestStage(cwd);
  }
}
