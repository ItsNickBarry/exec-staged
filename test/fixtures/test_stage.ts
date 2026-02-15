import pkg from '../../package.json';
import { execStaged } from '../../src/lib/exec_staged.js';
import { spawnSync } from '../../src/lib/spawn.js';
import { Stage } from '../../src/lib/stage.js';
import type {
  ExecStagedConfig,
  ExecStagedUserConfig,
  StageOptions,
} from '../../src/types.js';
import envPaths from 'env-paths';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { registerExitHandler } from 'on-process-exit';
import parseArgsStringToArgv from 'string-argv';

const TEST_STAGE_OPTIONS: StageOptions = { quiet: true };

export class TestStage extends Stage {
  declare public cwd: string;
  declare public check: () => void;
  declare public prepare: () => void;
  declare public run: (tasks: ExecStagedConfig) => Promise<void>;
  declare public merge: () => void;
  declare public revert: () => void;
  declare public git: (args: string[]) => string;

  constructor(cwd: string) {
    super(cwd, TEST_STAGE_OPTIONS);
  }

  public readFile(relativePath: string): string {
    return fs.readFileSync(this.resolve(relativePath), 'utf-8');
  }

  public writeFile(relativePath: string, contents: string = '') {
    const absolutePath = this.resolve(relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }

  public chmod(relativePath: string, mode: fs.Mode) {
    fs.chmodSync(this.resolve(relativePath), mode);
  }

  public mkdir(relativePath: string) {
    fs.mkdirSync(this.resolve(relativePath), { recursive: true });
  }

  public rm(relativePath: string) {
    fs.rmSync(this.resolve(relativePath), { recursive: true, force: true });
  }

  public async execStaged(tasks: ExecStagedUserConfig): Promise<boolean> {
    return await execStaged(this.cwd, tasks, TEST_STAGE_OPTIONS);
  }

  public spawnSync(task: string) {
    return spawnSync(this.cwd, parseArgsStringToArgv(task));
  }

  private resolve(relativePath: string): string {
    assert(!path.isAbsolute(relativePath), 'input path must be relative');
    return path.resolve(this.cwd, relativePath);
  }

  public static create() {
    const cwd = path.resolve(envPaths(pkg.name).temp, crypto.randomUUID());

    registerExitHandler(() => {
      fs.rmSync(cwd, { recursive: true, force: true });
    });

    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(
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
