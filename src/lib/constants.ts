import pkg from '../../package.json' with { type: 'json' };
import type { ExecStagedConfigEntry } from '../types.js';

export const DEFAULT_CONFIG_ENTRY: Omit<ExecStagedConfigEntry, 'task'> = {
  diff: 'AM',
  glob: '**',
};

export const MERGE_FILES = ['MERGE_HEAD', 'MERGE_MODE', 'MERGE_MSG'] as const;

export const MESSAGE_PREFIX = `💾 ${pkg.name}`;
export const BACKUP_STASH_MESSAGE = `${MESSAGE_PREFIX} backup stash`;
export const INITIAL_COMMIT_MESSAGE = `${MESSAGE_PREFIX} initial commit`;

export const ARTIFACTS_DIRECTORY = `.${pkg.name}`;

export const INTERPOLATION_IDENTIFIER = '$FILES';

const PREFIX = '➡️ ';

export const stageLifecycleMessages = {
  check: `${PREFIX}Checking environment...`,
  prepare: `${PREFIX}Preparing repository...`,
  run: `${PREFIX}Running tasks...`,
  merge: `${PREFIX}Merging new changes with saved state...`,
  revert: `${PREFIX}Reverting to saved state...`,
};
