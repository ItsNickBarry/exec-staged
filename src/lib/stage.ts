import type { StageOptions } from '../types.js';
import { BACKUP_STASH_MESSAGE } from './constants.js';
import { spawn, spawnSync } from './spawn.js';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

export class Stage {
  public readonly cwd: string;
  protected stashed: boolean = false;
  protected quiet: boolean;

  constructor(cwd: string, options: StageOptions = {}) {
    this.cwd = cwd;
    this.quiet = Boolean(options.quiet);
  }

  public async exec(tasks: string[]) {
    try {
      this.check();
      this.prepare();
      await this.run(tasks);
      this.merge();
      this.clean();
    } catch (error) {
      this.revert();
      this.clean();
      throw error;
    }
  }

  protected check() {
    try {
      const version = this.git(['--version']).match(
        /git version (\d+\.\d+\.\d+)/,
      )?.[1];

      if (!version || semver.lte(version, '2.13.0')) {
        this.log('⚠️ Unsupported git version!');
        throw new Error('TODO: error');
      }
    } catch (error) {
      this.log('⚠️ Git installation not found!');
      throw error;
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
    const status = this.git(['status', '-z']);

    // if there are no files in index or working tree, do not attempt to stash
    if (status.length === 0) return;

    try {
      this.log('➡️ Creating backup stash and hiding unstaged changes...');
      // TODO: keep unstaged deletions in index

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
    this.log(
      `➡️ Running ${tasks.length} task${tasks.length === 1 ? '' : 's'}...`,
    );

    for (const task of tasks) {
      try {
        this.log(`➡️ Running task: ${task}`);
        await spawn(this.cwd, task);
      } catch (error) {
        this.log(`⚠️ Error running task: \`${task}\`!`);
        throw error;
      }
    }
  }

  protected merge() {
    let stash: string | undefined;

    if (this.stashed) {
      this.log('➡️ Cleaning up redundant files in index...');

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
      this.log('➡️ Adding changes made by tasks...');
      this.git(['add', '-A']);
    } catch (error) {
      this.log('⚠️ Error adding new changes!');
      throw error;
    }

    if (!this.stashed) return;

    try {
      this.log('➡️ Restoring unstaged changes...');
      this.git(['stash', 'apply', '--index', stash!]);
    } catch (error) {
      this.log('⚠️ Error restoring unstaged changes!');
      throw error;
    }
  }

  protected revert() {
    if (!this.stashed) return;

    try {
      this.log('➡️ Restoring state from backup stash...');

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
    if (!this.stashed) return;

    try {
      this.log('➡️ Dropping backup stash...');
      this.git(['stash', 'drop', this.findBackupStash()]);
    } catch (error) {
      this.log('⚠️ Failed to drop backup stash!');
      throw error;
    }
  }

  protected git(args: string[]) {
    return spawnSync(this.cwd, ['git', ...args]);
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
    if (!this.quiet) {
      console.log(...params);
    }
  }
}
