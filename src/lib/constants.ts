import pkg from '../../package.json' with { type: 'json' };

export const MERGE_FILES = ['MERGE_HEAD', 'MERGE_MODE', 'MERGE_MSG'] as const;

export const BACKUP_STASH_MESSAGE = `💾 ${pkg.name} backup stash`;
export const STAGED_CHANGES_COMMIT_MESSAGE = `💾 ${pkg.name} staged changes`;

const PREFIX = '➡️ ';

export const stageLifecycleMessages = {
  check: `${PREFIX}Checking environment...`,
  prepare: `${PREFIX}Preparing repository...`,
  run: `${PREFIX}Running tasks...`,
  merge: `${PREFIX}Merging new changes with saved state...`,
  revert: `${PREFIX}Reverting to saved state...`,
};
