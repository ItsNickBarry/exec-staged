import pkg from '../package.json' with { type: 'json' };
import child_process from 'node:child_process';
import { simpleGit } from 'simple-git';

export default async (cwd: string) => {
  const STASH_MESSAGE = `💾 ${pkg.name} backup stash`;

  const git = simpleGit();

  const dropBackupStash = async () => {
    try {
      console.log('➡️ Dropping backup stash...');
      await git.stash(['drop', 'stash@{0}']);
    } catch (error) {
      console.log('⚠️ Failed to drop backup stash!');
      process.exit(1);
    }
  };

  const restoreBackupStash = async () => {
    try {
      console.log('➡️ Restoring state from backup stash...');
      await git.reset(['--hard', 'HEAD']);
      await git.stash(['apply', '--index', 'stash@{0}']);
      await dropBackupStash();
    } catch (error) {
      console.log('⚠️ Failed to restore state from backup stash!');
      process.exit(1);
    }
  };

  try {
    const version = await git.version();

    if (version.major < 2 || (version.major === 2 && version.minor < 14)) {
      console.log('⚠️ Unsupported git version!');
      process.exit(1);
    }
  } catch (error) {
    console.log('⚠️ Git installation not found!');
    process.exit(1);
  }

  const list = await git.stash(['list']);

  if (list.includes(STASH_MESSAGE)) {
    console.log('⚠️ Found unexpected backup stash!');
    console.log(
      'It must be left over from a previous failed run.  Remove it before proceeding.',
    );
    process.exit(1);
  }

  try {
    console.log('➡️ Creating backup stash and hiding unstaged changes...');
    // TODO: keep unstaged deletions in index
    await git.stash([
      'push',
      '--keep-index',
      '--include-untracked',
      '--message',
      STASH_MESSAGE,
    ]);
  } catch (error) {
    console.log('⚠️ Error creating backup stash!');
    process.exit(1);
  }

  // TODO: restore merge status

  const tasks = ['prettier --write .', 'knip'];

  try {
    console.log('➡️ Running tasks...');

    for (const task of tasks) {
      const result = child_process.spawnSync('pnpm', task.split(' '), {
        stdio: 'inherit',
      });

      if (result.status !== 0) {
        console.log(`⚠️ Error running task: \`${task}\`!`);
        await restoreBackupStash();
        process.exit(1);
      }
    }
  } catch (error) {
    console.log('⚠️ Uncaught error running tasks!');
    await restoreBackupStash();
    process.exit(1);
  }

  try {
    console.log('➡️ Adding changes made by tasks...');
    await git.add(['-A']);
  } catch (error) {
    console.log('⚠️ Error adding new changes!');
    await restoreBackupStash();
    process.exit(1);
  }

  try {
    console.log('➡️ Restoring unstaged changes...');
    await git.stash(['apply', '--index', 'stash@{0}']);
  } catch (error) {
    console.log('⚠️ Error restoring unstaged changes!');
    await restoreBackupStash();
    process.exit(1);
  }

  await dropBackupStash();
  process.exit(0);
};
