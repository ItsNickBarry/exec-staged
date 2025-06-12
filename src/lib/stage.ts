import { BACKUP_STASH_MESSAGE } from './constants.js';
import { Git } from './git.js';
import spawn from 'nano-spawn';
import { parseArgsStringToArgv } from 'string-argv';

export class Stage {
  public readonly cwd: string;
  protected readonly git: Git;
  protected stashed: boolean = false;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.git = new Git(cwd);
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

  private check() {
    try {
      const version = this.git
        .exec(['--version'])
        .match(/git version (\d+\.\d+\.\d+)/)?.[1];

      const [major, minor] = version!.match(/(\d+)/g)!.map((n) => parseInt(n));

      if (major < 2 || (major === 2 && minor < 14)) {
        console.log('⚠️ Unsupported git version!');
        throw new Error('TODO: error');
      }
    } catch (error) {
      console.log('⚠️ Git installation not found!');
      throw error;
    }

    try {
      this.git.exec(['rev-parse', '--is-inside-work-tree']);
    } catch (error) {
      console.log('⚠️ Not a git repository!');
      throw new Error('TODO: error');
    }

    const list = this.git.exec(['stash', 'list']);

    if (list.includes(BACKUP_STASH_MESSAGE)) {
      console.log('⚠️ Found unexpected backup stash!');
      console.log(
        'It must be left over from a previous failed run.  Remove it before proceeding.',
      );
      throw new Error('TODO: error');
    }
  }

  private prepare() {
    const status = this.git.exec(['status', '-z']);

    // if there are no files in index or working directory, do not attempt to stash
    if (status.length === 0) return;

    try {
      console.log('➡️ Creating backup stash and hiding unstaged changes...');
      // TODO: keep unstaged deletions in index

      this.git.exec([
        'stash',
        'push',
        '--keep-index',
        '--include-untracked',
        '--message',
        BACKUP_STASH_MESSAGE,
      ]);

      this.stashed = true;
    } catch (error) {
      if (
        String(error).includes(
          "error: pathspec ':/' did not match any file(s) known to git",
        )
      ) {
        // this error is thrown if no files are committed or staged
        // however, the stash is successfully created and the working directory cleared
        // this situation is unlikely in production, but occurs in the tests
      } else {
        console.log('⚠️ Error creating backup stash!');
        throw error;
      }
    }

    // TODO: restore merge status
  }

  private async run(task: string) {
    try {
      console.log(`➡️ Running task: ${task}`);

      const [command, ...args] = parseArgsStringToArgv(task);

      await spawn(command, args, {
        cwd: this.cwd,
        preferLocal: true,
        stdio: 'inherit',
      });
    } catch (error) {
      console.log(`⚠️ Error running task: \`${task}\`!`);
      throw error;
    }
  }

  private merge() {
    try {
      console.log('➡️ Adding changes made by tasks...');
      this.git.exec(['add', '-A']);
    } catch (error) {
      console.log('⚠️ Error adding new changes!');
      throw error;
    }

    if (!this.stashed) return;

    try {
      console.log('➡️ Restoring unstaged changes...');
      this.git.exec(['stash', 'apply', '--index', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Error restoring unstaged changes!');
      throw error;
    }
  }

  private revert() {
    if (!this.stashed) return;

    try {
      console.log('➡️ Restoring state from backup stash...');
      this.git.exec(['reset', '--hard', 'HEAD']);
      this.git.exec(['stash', 'apply', '--index', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Failed to restore state from backup stash!');
      throw error;
    }
  }

  private clean() {
    if (!this.stashed) return;

    try {
      console.log('➡️ Dropping backup stash...');
      this.git.exec(['stash', 'drop', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Failed to drop backup stash!');
      throw error;
    }
  }
}
