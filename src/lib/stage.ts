import { BACKUP_STASH_MESSAGE } from './constants.js';
import spawn from 'nano-spawn';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';
import { parseArgsStringToArgv } from 'string-argv';

export class Stage {
  public readonly cwd: string;
  protected readonly git: SimpleGit;
  protected stashed: boolean = false;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.git = simpleGit(cwd);
  }

  public async exec(tasks: string[]) {
    try {
      await this.check();
      await this.prepare();

      console.log(
        `➡️ Running ${tasks.length} task${tasks.length === 1 ? '' : 's'}...`,
      );

      for (const task of tasks) {
        await this.run(task);
      }

      await this.merge();
      await this.clean();
    } catch (error) {
      await this.revert();
      await this.clean();
      throw error;
    }
  }

  private async check() {
    try {
      const version = await this.git.version();

      if (version.major < 2 || (version.major === 2 && version.minor < 14)) {
        console.log('⚠️ Unsupported git version!');
        throw new Error('TODO: error');
      }
    } catch (error) {
      console.log('⚠️ Git installation not found!');
      throw error;
    }

    if (!(await this.git.checkIsRepo())) {
      console.log('⚠️ Not a git repository!');
      throw new Error('TODO: error');
    }

    const list = await this.git.stash(['list']);

    if (list.includes(BACKUP_STASH_MESSAGE)) {
      console.log('⚠️ Found unexpected backup stash!');
      console.log(
        'It must be left over from a previous failed run.  Remove it before proceeding.',
      );
      throw new Error('TODO: error');
    }
  }

  private async prepare() {
    const status = await this.git.status();

    // if there are no files in index or working directory, do not attempt to stash
    if (status.files.length === 0) return;

    try {
      console.log('➡️ Creating backup stash and hiding unstaged changes...');
      // TODO: keep unstaged deletions in index
      await this.git.stash([
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

  private async merge() {
    try {
      console.log('➡️ Adding changes made by tasks...');
      await this.git.add(['-A']);
    } catch (error) {
      console.log('⚠️ Error adding new changes!');
      throw error;
    }

    if (!this.stashed) return;

    try {
      console.log('➡️ Restoring unstaged changes...');
      await this.git.stash(['apply', '--index', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Error restoring unstaged changes!');
      throw error;
    }
  }

  private async revert() {
    if (!this.stashed) return;

    try {
      console.log('➡️ Restoring state from backup stash...');
      await this.git.reset(['--hard', 'HEAD']);
      await this.git.stash(['apply', '--index', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Failed to restore state from backup stash!');
      throw error;
    }
  }

  private async clean() {
    if (!this.stashed) return;

    try {
      console.log('➡️ Dropping backup stash...');
      await this.git.stash(['drop', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Failed to drop backup stash!');
      throw error;
    }
  }
}
