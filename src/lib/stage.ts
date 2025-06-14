import type { StageOptions } from '../types.js';
import { BACKUP_STASH_MESSAGE, stageLifecycleMessages } from './constants.js';
import { Logger } from './logger.js';
import { spawn, spawnSync } from './spawn.js';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

export class Stage {
  public readonly cwd: string;
  protected stashed: boolean = false;
  private logger: Logger;

  constructor(cwd: string, options: StageOptions = {}) {
    this.cwd = cwd;
    this.logger = new Logger(options.quiet);
    this.logger.debug(`cwd: ${cwd}`);
  }

  public async exec(tasks: string[]) {
    try {
      this.check();
      this.prepare();
      await this.run(tasks);
      this.merge();
      this.clean();
    } catch (error) {
      this.logger.debug(error);
      this.revert();
      this.clean();
      throw error;
    }
  }

  protected check() {
    this.logger.log(stageLifecycleMessages.check);
    let version: string | undefined;

    if (!fs.existsSync(this.cwd)) {
      this.logger.log('⚠️ Directory does not exist!');
      throw new Error('cwd does not exist');
    }

    try {
      version = this.git(['--version']).match(
        /git version (\d+\.\d+\.\d+)/,
      )?.[1];
    } catch (error) {
      this.logger.log('⚠️ Git installation not found!');
      throw error;
    }

    if (!version || semver.lte(version, '2.13.0')) {
      this.logger.log('⚠️ Unsupported git version!');
      throw new Error('unsupported git version');
    }

    let gitRootDirectory: string;

    try {
      gitRootDirectory = this.git(['rev-parse', '--show-toplevel']).trim();
    } catch (error) {
      this.logger.log('⚠️ Not a git repository!');
      throw new Error('cwd is not a git repository');
    }

    if (gitRootDirectory !== this.cwd) {
      this.logger.log('⚠️ Not in git root directory!');
      throw new Error('cwd is not a git repository root directory');
    }

    const list = this.git(['stash', 'list']);

    if (list.includes(BACKUP_STASH_MESSAGE)) {
      this.logger.log('⚠️ Found unexpected backup stash!');
      this.logger.log(
        'It must be left over from a previous failed run.  Remove it before proceeding.',
      );
      throw new Error('unexpected backup stash');
    }
  }

  protected prepare() {
    this.logger.log(stageLifecycleMessages.prepare);
    const status = this.git(['status', '-z']);

    // if there are no files in index or working tree, do not attempt to stash
    if (status.length === 0) return;

    try {
      this.logger.debug(
        '➡️ ➡️ Creating backup stash and hiding unstaged changes...',
      );

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
      this.logger.log('⚠️ Error creating backup stash!');
      throw error;
    }

    // TODO: restore merge status
  }

  protected async run(tasks: string[]) {
    this.logger.log(stageLifecycleMessages.run);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      try {
        this.logger.log(
          `➡️ Running task ${i + 1} of ${tasks.length}: \`${task}\`...`,
        );
        const output = await spawn(this.cwd, task);
        this.logger.debug(
          output
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n'),
        );
      } catch (error) {
        this.logger.log(`⚠️ Error running task: \`${task}\`!`);
        throw error;
      }
    }
  }

  protected merge() {
    this.logger.log(stageLifecycleMessages.merge);

    let stash: string | undefined;

    if (this.stashed) {
      this.logger.debug('➡️ ➡️ Cleaning up redundant files in index...');

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
      this.logger.debug('➡️ ➡️ Adding changes made by tasks...');
      this.git(['add', '-A']);
    } catch (error) {
      this.logger.log('⚠️ Error adding new changes!');
      throw error;
    }

    if (!this.stashed) return;

    try {
      this.logger.debug('➡️ ➡️ Restoring unstaged changes from stash...');
      this.git(['stash', 'apply', '--index', stash!]);
    } catch (error) {
      this.logger.log('⚠️ Error restoring unstaged changes from stash!');
      throw error;
    }
  }

  protected revert() {
    this.logger.log(stageLifecycleMessages.revert);

    if (!this.stashed) return;

    try {
      this.logger.debug('➡️ ➡️ Restoring state from backup stash...');

      // attempt to retrieve the stash before running any damaging operations
      const stash = this.findBackupStash();

      this.git(['add', '-A']);
      this.git(['reset', '--hard', 'HEAD']);
      this.git(['stash', 'apply', '--index', stash]);
    } catch (error) {
      this.logger.log('⚠️ Failed to restore state from backup stash!');
      throw error;
    }
  }

  protected clean() {
    this.logger.log(stageLifecycleMessages.clean);

    if (!this.stashed) return;

    try {
      this.git(['stash', 'drop', this.findBackupStash()]);
    } catch (error) {
      this.logger.log('⚠️ Failed to drop backup stash!');
      throw error;
    }
  }

  protected git(args: string[]): string {
    this.logger.debug(`git: ${args.map((arg) => `[${arg}]`).join(' ')}`);
    const output = spawnSync(this.cwd, ['git', ...args]);
    this.logger.debug(
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
}
