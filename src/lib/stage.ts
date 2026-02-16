import type { ExecStagedConfig, StageOptions } from '../types.js';
import {
  BACKUP_STASH_MESSAGE,
  INTERPOLATION_IDENTIFIER,
  MERGE_FILES,
  STAGED_CHANGES_COMMIT_MESSAGE,
  stageLifecycleMessages,
} from './constants.js';
import { Logger } from './logger.js';
import { spawn, spawnSync } from './spawn.js';
import micromatch from 'micromatch';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import parseArgsStringToArgv from 'string-argv';

export class Stage {
  public readonly logger: Logger;
  protected readonly cwd: string;
  protected stashed: boolean = false;
  private readonly status: { [file: string]: string } = {};
  private readonly mergeStatus: (typeof MERGE_FILES)[number][] = [];
  private head?: string;
  private _gitDir?: string;

  private get gitDir(): string {
    return (this._gitDir ??= this.git(['rev-parse', '--absolute-git-dir']));
  }

  private get patchPath(): string {
    return path.resolve(this.gitDir, 'patch.diff');
  }

  constructor(cwd: string, options: StageOptions = {}) {
    this.cwd = cwd;
    this.logger = new Logger(options.quiet);
    this.logger.debug(`cwd: ${cwd}`);
  }

  public async exec(tasks: ExecStagedConfig) {
    try {
      this.check();
      this.prepare();
    } catch (error) {
      this.logger.debug(error);
      throw error;
    }

    try {
      await this.run(tasks);
      this.merge();
    } catch (error) {
      this.logger.debug(error);

      try {
        this.revert();
      } catch (error) {
        this.logger.debug(error);
      }

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
      throw new Error('git installation not found');
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

    if (
      MERGE_FILES.some((f) =>
        fs.existsSync(path.resolve(this.gitDir, `${f}.bak`)),
      )
    ) {
      this.logger.log('⚠️ Found unexpected merge status backup!');
      this.logger.log(
        'It must be left over from a previous failed run.  Remove it before proceeding.',
      );
      throw new Error('unexpected merge status backup');
    }

    if (this.indexOfBackupStash() !== -1) {
      this.logger.log('⚠️ Found unexpected backup stash!');
      this.logger.log(
        'It must be left over from a previous failed run.  Remove it before proceeding.',
      );
      throw new Error('unexpected backup stash');
    }

    if (
      this.git(['log', '--grep', STAGED_CHANGES_COMMIT_MESSAGE, '--format=%s'])
    ) {
      this.logger.log('⚠️ Found unexpected temporary commit!');
      this.logger.log(
        'It must be left over from a previous failed run.  Remove it before proceeding.',
      );
      throw new Error('unexpected temporary commit');
    }
  }

  protected prepare() {
    this.logger.log(stageLifecycleMessages.prepare);

    this.head = this.git(['rev-parse', 'HEAD']);

    this.git(['status', '--porcelain', '--no-renames'])
      .split('\n')
      .filter((f) => f.length)
      .forEach((f) => (this.status[f.slice(3)] = f.slice(0, 2)));

    // if there are no files in index or working tree, do not attempt to stash
    if (Object.keys(this.status).length === 0) return;

    try {
      this.logger.debug('➡️ ➡️ Creating patch of unstaged changes...');

      const unstagedAdditions = Object.entries(this.status)
        .filter(([, s]) => s.match(/^\?\?/))
        .map(([f]) => f);

      if (unstagedAdditions.length) {
        this.git(['add', '--intent-to-add', '--', ...unstagedAdditions]);
      }

      this.git([
        'diff',
        '--binary',
        '--default-prefix',
        // skip deleted files because patch doesn't apply if they're modified
        '--diff-filter=d',
        '--no-color',
        '--no-ext-diff',
        '--no-rename-empty',
        '--patch',
        '--submodule=short',
        '--unified=0',
        '--output',
        this.patchPath,
      ]);

      if (unstagedAdditions.length) {
        this.git(['reset', '--', ...unstagedAdditions]);
      }
    } catch (error) {
      this.logger.log('⚠️ Error creating patch of unstaged changes!');
      throw error;
    }

    try {
      this.logger.debug('➡️ ➡️ Backing up merge status...');
      this.backupMergeStatus();
    } catch (error) {
      this.logger.log('⚠️ Error backing up merge status!');
      throw error;
    }

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
  }

  protected async run(tasks: ExecStagedConfig) {
    this.logger.log(stageLifecycleMessages.run);

    for (let i = 0; i < tasks.length; i++) {
      const { task, diff, glob } = tasks[i];

      try {
        this.logger.log(
          `➡️ Running task ${i + 1} of ${tasks.length}: \`${task}\`...`,
        );

        const taskArgs = parseArgsStringToArgv(task);

        const interpolationIndex = taskArgs.indexOf(INTERPOLATION_IDENTIFIER);

        if (interpolationIndex !== -1) {
          const files = micromatch(
            Object.entries(this.status)
              .filter(([, s]) => s.match(new RegExp(`^[${diff}]`)))
              .map(([f]) => f),
            glob,
            { dot: true },
          );

          if (files.length === 0) {
            this.logger.log(`➡️ No matching files, skipping task...`);
            continue;
          }

          taskArgs.splice(interpolationIndex, 1, ...files);
        }

        const { stdout } = await spawn(this.cwd, taskArgs);

        this.logger.debug(stdout.replaceAll(/^/gm, '> '));
      } catch (error) {
        this.logger.log(`⚠️ Error running task: \`${task}\`!`);
        throw error;
      }
    }
  }

  protected merge() {
    this.logger.log(stageLifecycleMessages.merge);

    try {
      this.logger.debug('➡️ ➡️ Adding changes made by tasks...');
      this.git(['add', '-A']);
    } catch (error) {
      this.logger.log('⚠️ Error adding new changes!');
      throw error;
    }

    if (!this.stashed) return;

    // attempt to retrieve the stash before running any damaging operations
    const stash = this.findBackupStash();

    try {
      this.logger.debug('➡️ ➡️ Restoring unstaged changes from stash...');

      // commit staged changes to keep them separate from unstaged changes in
      // patch, because `--3-way` adds unstaged changes to the index
      this.git([
        'commit',
        '--allow-empty',
        '--no-verify',
        '-m',
        STAGED_CHANGES_COMMIT_MESSAGE,
      ]);

      // apply patch containing unstaged changes
      this.git([
        'apply',
        '--allow-empty',
        '--recount',
        '--unidiff-zero',
        '--whitespace=nowarn',
        '--3way',
        this.patchPath,
      ]);

      // unstaged deletions are not included in the patch and must be handled
      // separately because the patch cannot be applied if such files are
      // modified by tasks
      Object.entries(this.status)
        .filter(([, s]) => s.match(/^.D/))
        .map(([f]) => f)
        .forEach((f) => fs.rmSync(path.resolve(this.cwd, f)));

      // make sure all restored unstaged changes are kept out of the index
      this.git(['reset']);

      // undo temporary commit while keeping its changes in the index
      this.git(['reset', '--soft', this.head!]);

      // clean up
      fs.rmSync(this.patchPath);
      this.git(['stash', 'drop', stash]);
    } catch (error) {
      this.logger.log('⚠️ Error restoring unstaged changes from stash!');
      throw error;
    }

    this.restoreMergeStatus();
  }

  protected revert() {
    this.logger.log(stageLifecycleMessages.revert);

    let stash: string | undefined;

    if (this.stashed) {
      // attempt to retrieve the stash before running any damaging operations
      stash = this.findBackupStash();
    }

    try {
      this.logger.debug('➡️ ➡️ Reverting changes made by tasks...');

      this.git(['add', '-A']);
      this.git(['reset', '--hard', this.head!]);
    } catch (error) {
      this.logger.log('⚠️ Failed to revert changes made by tasks!');
      throw error;
    }

    if (!this.stashed) return;

    try {
      this.logger.debug('➡️ ➡️ Restoring state from backup stash...');

      this.git(['stash', 'apply', '--index', stash!]);
      this.git(['stash', 'drop', stash!]);
      this.restoreMergeStatus();
    } catch (error) {
      this.logger.log('⚠️ Failed to restore state from backup stash!');
      throw error;
    }
  }

  protected git(args: string[]): string {
    this.logger.debug(`git: ${args.map((arg) => `[${arg}]`).join(' ')}`);

    const { stdout } = spawnSync(this.cwd, ['git', ...args]);

    this.logger.debug(stdout.replaceAll(/^/gm, '> '));

    return stdout;
  }

  private backupMergeStatus() {
    for (const mergeFile of MERGE_FILES) {
      const file = path.resolve(this.gitDir, mergeFile);
      if (fs.existsSync(file)) {
        fs.copyFileSync(file, `${file}.bak`);
        this.mergeStatus.push(mergeFile);
      }
    }
  }

  private restoreMergeStatus() {
    for (const mergeFile of this.mergeStatus) {
      const file = path.resolve(this.gitDir, mergeFile);
      fs.renameSync(`${file}.bak`, file);
    }
  }

  private indexOfBackupStash(): number {
    return this.git(['stash', 'list'])
      .split('\n')
      .findIndex((el) => el.includes(BACKUP_STASH_MESSAGE));
  }

  private findBackupStash(): string {
    const index = this.indexOfBackupStash();

    if (index === -1) {
      throw new Error('missing backup stash');
    }

    return `stash@{${index}}`;
  }
}
