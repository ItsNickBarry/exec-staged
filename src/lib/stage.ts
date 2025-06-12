import { BACKUP_STASH_MESSAGE } from './constants.js';
import { spawn, spawnSync } from './spawn.js';
import semver from 'semver';

export class Stage {
  public readonly cwd: string;
  protected stashed: boolean = false;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  public async exec(tasks: string[]) {
    try {
      this.check();
      this.prepare();

      console.log(
        `➡️ Running ${tasks.length} task${tasks.length === 1 ? '' : 's'}...`,
      );

      for (const task of tasks) {
        await this.run(task);
      }

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
        console.log('⚠️ Unsupported git version!');
        throw new Error('TODO: error');
      }
    } catch (error) {
      console.log('⚠️ Git installation not found!');
      throw error;
    }

    try {
      this.git(['rev-parse', '--is-inside-work-tree']);
    } catch (error) {
      console.log('⚠️ Not a git repository!');
      throw new Error('TODO: error');
    }

    const list = this.git(['stash', 'list']);

    if (list.includes(BACKUP_STASH_MESSAGE)) {
      console.log('⚠️ Found unexpected backup stash!');
      console.log(
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
      console.log('➡️ Creating backup stash and hiding unstaged changes...');
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
      console.log('⚠️ Error creating backup stash!');
      throw error;
    }

    // TODO: restore merge status
  }

  protected async run(task: string) {
    try {
      console.log(`➡️ Running task: ${task}`);
      await spawn(this.cwd, task);
    } catch (error) {
      console.log(`⚠️ Error running task: \`${task}\`!`);
      throw error;
    }
  }

  protected merge() {
    try {
      console.log('➡️ Adding changes made by tasks...');
      this.git(['add', '-A']);
    } catch (error) {
      console.log('⚠️ Error adding new changes!');
      throw error;
    }

    if (!this.stashed) return;

    try {
      console.log('➡️ Restoring unstaged changes...');
      this.git(['stash', 'apply', '--index', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Error restoring unstaged changes!');
      throw error;
    }
  }

  protected revert() {
    if (!this.stashed) return;

    try {
      console.log('➡️ Restoring state from backup stash...');
      this.git(['reset', '--hard', 'HEAD']);
      this.git(['stash', 'apply', '--index', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Failed to restore state from backup stash!');
      throw error;
    }
  }

  protected clean() {
    if (!this.stashed) return;

    try {
      console.log('➡️ Dropping backup stash...');
      this.git(['stash', 'drop', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Failed to drop backup stash!');
      throw error;
    }
  }

  protected git(args: string[]) {
    return spawnSync(this.cwd, ['git', ...args]);
  }
}
