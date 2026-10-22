import pkg from '../../package.json' with { type: 'json' };
import type { ExecStagedConfig, StageOptions } from '../types.js';
import {
  ARTIFACTS_DIRECTORY,
  BACKUP_MERGE_STATUS_TREE_REF,
  BACKUP_STAGED_TREE_REF,
  BACKUP_WORKING_TREE_REF,
  INTERPOLATION_IDENTIFIER,
  MERGE_FILES,
  stageLifecycleMessages,
} from './constants.js';
import { Logger } from './logger.js';
import { spawn, spawnSync } from './spawn.js';
import envPaths from 'env-paths';
import micromatch from 'micromatch';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { onExit } from 'signal-exit';
import parseArgsStringToArgv from 'string-argv';

type Backup = { stagedTree: string; workingTree: string };

export class Stage {
  public readonly logger: Logger;
  protected readonly cwd: string;
  protected backedUp: boolean = false;
  private readonly status: { [file: string]: string } = {};
  private stagedTree?: string;
  private _gitDir?: string;
  private _indexPath?: string;
  private _tempDir?: string;
  private needsRevert: boolean = false;

  private get gitDir(): string {
    return (this._gitDir ??= this.git(['rev-parse', '--absolute-git-dir']));
  }

  private get artifactsDir(): string {
    return path.resolve(this.gitDir, ARTIFACTS_DIRECTORY);
  }

  private get tempDir(): string {
    return (this._tempDir ??= fs.mkdtempSync(
      path.resolve(envPaths(pkg.name).temp, 'run-'),
    ));
  }

  private get patchPath(): string {
    return path.resolve(this.tempDir, 'patch.diff');
  }

  // absolute path of the real index, which holds the staged state; resolved via
  // git because it may differ from the default (`<git dir>/index`) depending on
  // execution context
  private get indexPath(): string {
    return (this._indexPath ??= path.resolve(
      this.cwd,
      this.git(['rev-parse', '--git-path', 'index']),
    ));
  }

  private get tempIndexPath(): string {
    return path.resolve(this.tempDir, 'index');
  }

  // environment for git commands that should use a temporary index instead of
  // the real one, so that the real index is not modified
  private get tempIndexEnv(): Record<string, string> {
    return { GIT_INDEX_FILE: this.tempIndexPath };
  }

  constructor(cwd: string, options: StageOptions = {}) {
    this.cwd = cwd;
    this.logger = new Logger(options.quiet);
    this.logger.debug(`cwd: ${cwd}`);
  }

  public async exec(tasks: ExecStagedConfig) {
    // register the exit handler before modifying the repository; signal-exit
    // only listens for signals while a handler is registered, and without a
    // listener a signal received during the synchronous prepare step would
    // terminate the process immediately, leaving the backup in place and
    // unstaged changes hidden
    const removeExitHandler = onExit(() => {
      if (this.needsRevert) {
        this.needsRevert = false;
        this.revert();
      }
    });

    try {
      try {
        this.check();
        this.prepare();
      } catch (error) {
        this.logger.debug(error);
        throw error;
      }

      this.needsRevert = true;

      try {
        await this.run(tasks);
        this.merge();
      } catch (error) {
        this.logger.debug(error);

        try {
          this.needsRevert = false;
          this.revert();
        } catch (error) {
          this.logger.debug(error);
        }

        throw error;
      }
    } finally {
      removeExitHandler();
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

    if (!version || semver.lt(version, '2.22.0')) {
      this.logger.log('⚠️ Unsupported git version!');
      throw new Error('unsupported git version');
    }

    let prefix: string;

    try {
      prefix = this.git(['rev-parse', '--show-prefix']).trim();
    } catch (error) {
      this.logger.log('⚠️ Not a git repository!');
      throw new Error('cwd is not a git repository');
    }

    if (prefix !== '') {
      this.logger.log('⚠️ Not in git root directory!');
      throw new Error('cwd is not a git repository root directory');
    }

    // --absolute-git-dir resolves symlinks, --git-dir does not; if they
    // differ, .git involves symlinks; walk the chain and reject if any
    // target is inside the repo, because creating the backup would include
    // (and remove) it along with untracked files, breaking all subsequent
    // operations
    let gitDirPath = path.resolve(
      this.cwd,
      this.git(['rev-parse', '--git-dir']),
    );

    while (fs.lstatSync(gitDirPath).isSymbolicLink()) {
      // readlink may return a relative path, so resolve against the
      // symlink's parent directory to get an absolute path
      const target = fs.readlinkSync(gitDirPath);
      gitDirPath = path.resolve(path.dirname(gitDirPath), target);

      if (!path.relative(this.cwd, gitDirPath).startsWith('..')) {
        this.logger.log(
          '⚠️ Git directory is a symlink pointing to a location within the repository!',
        );
        throw new Error(
          'git directory is a symlink pointing to a location within the repository',
        );
      }
    }

    if (fs.existsSync(this.artifactsDir)) {
      this.logger.log('⚠️ Found unexpected artifacts directory!');
      this.logger.log(
        'It must be left over from a previous failed run.  Run `exec-staged recover` to restore your repository.',
      );
      throw new Error('unexpected artifacts directory');
    }

    if (
      this.resolveRef(BACKUP_STAGED_TREE_REF) ||
      this.resolveRef(BACKUP_WORKING_TREE_REF) ||
      this.resolveRef(BACKUP_MERGE_STATUS_TREE_REF)
    ) {
      this.logger.log('⚠️ Found unexpected backup!');
      this.logger.log(
        'It must be left over from a previous failed run.  Run `exec-staged recover` to restore your repository.',
      );
      throw new Error('unexpected backup');
    }
  }

  protected prepare() {
    this.logger.log(stageLifecycleMessages.prepare);

    this.git(['status', '--porcelain', '--no-renames'])
      .split('\n')
      .filter((f) => f.length)
      .forEach((f) => (this.status[f.slice(3)] = f.slice(0, 2)));

    // the staged state, which tasks run against, and which the working tree is
    // reset to when reverting changes made by tasks
    this.stagedTree = this.git(['write-tree']);

    // if there are no files in index or working tree, do not create a backup
    if (Object.keys(this.status).length === 0) return;

    fs.mkdirSync(this.artifactsDir);

    try {
      this.logger.debug('➡️ ➡️ Creating backup and hiding unstaged changes...');

      // record the working tree, including untracked files
      fs.copyFileSync(this.indexPath, this.tempIndexPath);
      this.git(['add', '-A'], this.tempIndexEnv);
      const workingTree = this.git(['write-tree'], this.tempIndexEnv);

      // store the backup before modifying the working tree
      this.git(['update-ref', BACKUP_STAGED_TREE_REF, this.stagedTree]);
      this.git(['update-ref', BACKUP_WORKING_TREE_REF, workingTree]);

      this.backedUp = true;

      // reset the working tree to the staged state, hiding unstaged changes
      this.git(
        ['read-tree', '-u', '--reset', this.stagedTree],
        this.tempIndexEnv,
      );

      // must run after the reset, which depends on the temporary index
      this.logger.debug('➡️ ➡️ Backing up merge status...');
      this.backupMergeStatus();
    } catch (error) {
      this.logger.log('⚠️ Error creating backup!');
      this.logger.debug(error);

      // the working tree may have been modified before the error
      if (this.backedUp) {
        try {
          // TODO: make consistent with revert handling in exec
          this.revert();
        } catch (error) {
          this.logger.debug(error);
        }
      }

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
            {
              dot: true,
              // match filenames in any directory when glob has no path separators
              matchBase: !glob.includes('/'),
            },
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

    if (!this.backedUp) return;

    // make sure that the backup exists before running any damaging operations
    const { stagedTree, workingTree } = this.findBackup();

    try {
      this.logger.debug('➡️ ➡️ Creating patch of unstaged changes...');

      // unstaged changes are the differences between the backed-up staged state
      // and working tree
      this.git([
        'diff',
        '--binary',
        '--src-prefix=a/',
        '--dst-prefix=b/',
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
        stagedTree,
        workingTree,
      ]);
    } catch (error) {
      this.logger.log('⚠️ Error creating patch of unstaged changes!');
      throw error;
    }

    try {
      this.logger.debug('➡️ ➡️ Restoring unstaged changes...');

      // save staged changes to keep them separate from unstaged changes in
      // patch, because `--3-way` adds unstaged changes to the index
      const newStagedTree = this.git(['write-tree']);

      // apply patch containing unstaged changes.
      // `--allow-empty` could be used here, but it was not added to `git apply`
      // until 2.35.0 (January 2022), so we skip the call when the patch is empty.
      if (fs.statSync(this.patchPath).size > 0) {
        this.git([
          'apply',
          '--recount',
          '--unidiff-zero',
          '--whitespace=nowarn',
          '--3way',
          this.patchPath,
        ]);
      }

      // unstaged deletions are not included in the patch and must be handled
      // separately because the patch cannot be applied if such files are
      // modified by tasks; use force: true to handle cases where the file
      // doesn't exist (e.g., unstaged renames)
      Object.entries(this.status)
        .filter(([, s]) => s.match(/^.D/))
        .map(([f]) => f)
        .forEach((f) => fs.rmSync(path.resolve(this.cwd, f), { force: true }));

      // make sure all restored unstaged changes are kept out of the index
      this.git(['read-tree', '--reset', newStagedTree]);

      // clean up
      this.restoreMergeStatus();
      this.deleteBackup();
      fs.rmSync(this.artifactsDir, { recursive: true });
    } catch (error) {
      this.logger.log('⚠️ Error restoring unstaged changes!');
      throw error;
    }

    this.needsRevert = false;
  }

  protected revert() {
    this.logger.log(stageLifecycleMessages.revert);

    let backup: Backup | undefined;

    if (this.backedUp) {
      // attempt to retrieve the backup before running any damaging operations
      backup = this.findBackup();
    }

    try {
      this.logger.debug('➡️ ➡️ Reverting changes made by tasks...');

      if (backup) {
        this.restoreBackup(backup);
      } else {
        this.git(['add', '-A']);
        this.git(['read-tree', '-u', '--reset', this.stagedTree!]);
      }
    } catch (error) {
      this.logger.log('⚠️ Failed to revert changes made by tasks!');
      throw error;
    }

    if (!this.backedUp) return;

    try {
      this.logger.debug('➡️ ➡️ Cleaning up backup...');

      this.restoreMergeStatus();
      this.deleteBackup();
      fs.rmSync(this.artifactsDir, { recursive: true });
    } catch (error) {
      this.logger.log('⚠️ Failed to clean up backup!');
      throw error;
    }
  }

  protected git(args: string[], env?: Record<string, string>): string {
    this.logger.debug(
      `git: ${args.map((arg) => `[${arg}]`).join(' ')}${env ? ` ${JSON.stringify(env)}` : ''}`,
    );

    const { stdout } = spawnSync(this.cwd, ['git', ...args], env);

    this.logger.debug(stdout.replaceAll(/^/gm, '> '));

    return stdout;
  }

  // store merge status files as blobs in a tree referenced by a backup ref,
  // built in the temporary index because the files are inside the git
  // directory and cannot be added from the working tree
  private backupMergeStatus() {
    const cacheInfo = MERGE_FILES.filter((mergeFile) =>
      fs.existsSync(path.resolve(this.gitDir, mergeFile)),
    ).flatMap((mergeFile) => {
      const blob = this.git([
        'hash-object',
        '-w',
        '--no-filters',
        path.resolve(this.gitDir, mergeFile),
      ]);
      return ['--cacheinfo', `100644,${blob},${mergeFile}`];
    });

    if (cacheInfo.length === 0) return;

    this.git(['read-tree', '--empty'], this.tempIndexEnv);
    this.git(['update-index', '--add', ...cacheInfo], this.tempIndexEnv);
    const mergeStatusTree = this.git(['write-tree'], this.tempIndexEnv);
    this.git(['update-ref', BACKUP_MERGE_STATUS_TREE_REF, mergeStatusTree]);
  }

  // write merge status files from the backup tree into the git directory;
  // uses the temporary index, so must not run while it holds needed state
  private restoreMergeStatus() {
    const mergeStatusTree = this.resolveRef(BACKUP_MERGE_STATUS_TREE_REF);

    if (!mergeStatusTree) return;

    this.git(['read-tree', mergeStatusTree], this.tempIndexEnv);
    this.git(
      ['checkout-index', '-a', '-f', `--prefix=${this.gitDir}${path.sep}`],
      this.tempIndexEnv,
    );
  }

  private resolveRef(ref: string): string | undefined {
    try {
      return this.git(['rev-parse', '--verify', '-q', ref]);
    } catch {
      return undefined;
    }
  }

  private findBackup(): Backup {
    const stagedTree = this.resolveRef(BACKUP_STAGED_TREE_REF);
    const workingTree = this.resolveRef(BACKUP_WORKING_TREE_REF);

    if (!stagedTree || !workingTree) {
      throw new Error('missing backup');
    }

    return { stagedTree, workingTree };
  }

  private restoreBackup({ stagedTree, workingTree }: Backup) {
    fs.copyFileSync(this.indexPath, this.tempIndexPath);
    this.git(['add', '-A'], this.tempIndexEnv);
    this.git(['read-tree', '-u', '--reset', workingTree], this.tempIndexEnv);
    this.git(['read-tree', '--reset', stagedTree]);
  }

  private deleteBackup() {
    for (const ref of [
      BACKUP_MERGE_STATUS_TREE_REF,
      BACKUP_WORKING_TREE_REF,
      BACKUP_STAGED_TREE_REF,
    ]) {
      // succeeds even if the ref does not exist
      this.git(['update-ref', '-d', ref]);
    }
  }

  public recover() {
    const stagedTree = this.resolveRef(BACKUP_STAGED_TREE_REF);
    const workingTree = this.resolveRef(BACKUP_WORKING_TREE_REF);
    const mergeStatusTree = this.resolveRef(BACKUP_MERGE_STATUS_TREE_REF);
    const artifactsFound = fs.existsSync(this.artifactsDir);

    if (!stagedTree && !workingTree && !mergeStatusTree && !artifactsFound) {
      this.logger.log('➡️ Nothing to recover.');
      return;
    }

    if (stagedTree && workingTree) {
      this.logger.log('➡️ Found backup, restoring...');
      this.restoreBackup({ stagedTree, workingTree });
    }

    if (mergeStatusTree) {
      this.logger.log('➡️ Found merge status backup, restoring...');
      this.restoreMergeStatus();
    }

    this.deleteBackup();

    if (artifactsFound) {
      this.logger.log('➡️ Found artifacts directory, cleaning up...');
      fs.rmSync(this.artifactsDir, { recursive: true });
    }
  }
}
