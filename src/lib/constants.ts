import pkg from '../../package.json' with { type: 'json' };

export const BACKUP_STASH_MESSAGE = `💾 ${pkg.name} backup stash`;

const PREFIX = '➡️ ';

export const stageLifecycleMessages = {
  check: `${PREFIX}Checking environment...`,
  prepare: `${PREFIX}Preparing repository...`,
  run: `${PREFIX}Running tasks...`,
  merge: `${PREFIX}Merging new changes with saved state...`,
  revert: `${PREFIX}Reverting to saved state...`,
  clean: `${PREFIX}Dropping backup stash...`,
};
