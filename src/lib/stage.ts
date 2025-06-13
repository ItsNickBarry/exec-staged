import pkg from '../../package.json' with { type: 'json' };
import type { StageOptions } from '../types.js';
import { BACKUP_STASH_MESSAGE, stageLifecycleMessages } from './constants.js';
import { spawn, spawnSync } from './spawn.js';
import envPaths from 'env-paths';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

export class Stage {
  public readonly cwd: string;
  protected stashed: boolean = false;
  protected quiet: boolean;
  private debugFile: string;

  constructor(cwd: string, options: StageOptions = {}) {
    this.cwd = cwd;
    this.quiet = Boolean(options.quiet);
    this.debugFile = path.resolve(
      envPaths(pkg.name).temp,
      `debug-${new Date().getTime().toString()}.txt`,
    );
    fs.mkdirSync(path.dirname(this.debugFile), { recursive: true });
  }

  public async exec(tasks: string[]) {
    try {
      this.check();
      this.prepare();
      await this.run(tasks);
      this.merge();
      this.clean();
    } catch (error) {
      this.debug(error);
      this.revert();
      this.clean();
      throw error;
    }
  }

  protected check() {
    this.log(stageLifecycleMessages.check);
    let version: string | undefined;

    try {
      version = this.git(['--version']).match(
        /git version (\d+\.\d+\.\d+)/,
      )?.[1];
    } catch (error) {
      this.log('⚠️ Git installation not found!');
      throw error;
    }

    if (!version || semver.lte(version, '2.13.0')) {
      this.log('⚠️ Unsupported git version!');
      throw new Error('TODO: error');
    }

    try {
      this.git(['rev-parse', '--is-inside-work-tree']);
    } catch (error) {
      this.log('⚠️ Not a git repository!');
      throw new Error('TODO: error');
    }

    const list = this.git(['stash', 'list']);

    if (list.includes(BACKUP_STASH_MESSAGE)) {
      this.log('⚠️ Found unexpected backup stash!');
      this.log(
        'It must be left over from a previous failed run.  Remove it before proceeding.',
      );
      throw new Error('TODO: error');
    }
  }

  protected prepare() {
    this.log(stageLifecycleMessages.prepare);
    const status = this.git(['status', '-z']);

    // if there are no files in index or working tree, do not attempt to stash
    if (status.length === 0) return;

    try {
      this.debug('➡️ ➡️ Creating backup stash and hiding unstaged changes...');

      this.git([
        'stash',
        'push',
        '--keep-index',
        '--include-untracked',
        '--message',
        BACKUP_STASH_MESSAGE,
      ]);

      this.stashed = true;
    } catch (error) {
      this.log('⚠️ Error creating backup stash!');
      throw error;
    }

    // TODO: restore merge status
  }

  protected async run(tasks: string[]) {
    this.log(stageLifecycleMessages.run);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      try {
        this.log(`➡️ Running task ${i + 1} of ${tasks.length}: \`${task}\`...`);
        const output = await spawn(this.cwd, task);
        this.debug(
          output
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n'),
        );
      } catch (error) {
        this.log(`⚠️ Error running task: \`${task}\`!`);
        throw error;
      }
    }
  }

  protected merge() {
    this.log(stageLifecycleMessages.merge);

    let stash: string | undefined;

    if (this.stashed) {
      this.debug('➡️ ➡️ Cleaning up redundant files in index...');

      // attempt to retrieve the stash before running any damaging operations
      stash = this.findBackupStash();

      const unchangedFiles = this.git(['status', '--porcelain'])
        .split('\n')
        .filter((f) => f.match(/^. /));

      if (unchangedFiles.length) {
        this.git(['reset', '--', ...unchangedFiles.map((f) => f.slice(3))]);

        const tracked = unchangedFiles.filter((f) => f.match(/^[^A]/));

        if (tracked.length) {
          this.git(['restore', ...tracked.map((f) => f.slice(3))]);
        }

        const untracked = unchangedFiles.filter((f) => f.match(/^[A]/));

        if (untracked.length) {
          untracked.forEach((f) =>
            fs.rmSync(path.resolve(this.cwd, f.slice(3))),
          );
        }
      }
    }

    try {
      this.debug('➡️ ➡️ Adding changes made by tasks...');
      this.git(['add', '-A']);
    } catch (error) {
      this.log('⚠️ Error adding new changes!');
      throw error;
    }

    if (!this.stashed) return;

    try {
      this.debug('➡️ ➡️ Restoring unstaged changes from stash...');
      this.git(['stash', 'apply', '--index', stash!]);
    } catch (error) {
      this.log('⚠️ Error restoring unstaged changes from stash!');
      throw error;
    }
  }

  protected revert() {
    this.log(stageLifecycleMessages.revert);

    if (!this.stashed) return;

    try {
      this.debug('➡️ ➡️ Restoring state from backup stash...');

      // attempt to retrieve the stash before running any damaging operations
      const stash = this.findBackupStash();

      this.git(['add', '-A']);
      this.git(['reset', '--hard', 'HEAD']);
      this.git(['stash', 'apply', '--index', stash]);
    } catch (error) {
      this.log('⚠️ Failed to restore state from backup stash!');
      throw error;
    }
  }

  protected clean() {
    this.log(stageLifecycleMessages.clean);

    if (!this.stashed) return;

    try {
      this.git(['stash', 'drop', this.findBackupStash()]);
    } catch (error) {
      this.log('⚠️ Failed to drop backup stash!');
      throw error;
    }
  }

  protected git(args: string[]): string {
    this.debug(`git: ${args.map((arg) => `[${arg}]`).join(' ')}`);
    const output = spawnSync(this.cwd, ['git', ...args]);
    this.debug(
      output
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n'),
    );
    return output;
  }

  private findBackupStash(): string {
    if (this.stashed) {
      const index = this.git(['stash', 'list'])
        .split('\n')
        .findIndex((el) => el.includes(BACKUP_STASH_MESSAGE));

      if (index === -1) {
        throw new Error('TODO: error');
      }

      return `stash@{${index}}`;
    } else {
      return '';
    }
  }

  private log(...params: Parameters<typeof console.log>): void {
    this.debug(...params);

    if (!this.quiet) {
      console.log(...params);
    }
  }

  private debug(...params: Parameters<typeof console.debug>): void {
    fs.appendFileSync(this.debugFile, params.join('\n') + '\n');
  }
}
