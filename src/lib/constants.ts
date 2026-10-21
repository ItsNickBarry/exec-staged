import pkg from '../../package.json' with { type: 'json' };
import type { ExecStagedConfigEntry } from '../types.js';

export const DEFAULT_CONFIG_ENTRY: Omit<ExecStagedConfigEntry, 'task'> = {
  diff: 'AM',
  glob: '**',
};

export const MERGE_FILES = ['MERGE_HEAD', 'MERGE_MODE', 'MERGE_MSG'] as const;

// git shares refs across worktrees, except for those under special prefixes
// such as `refs/worktree/`, which are stored separately for each worktree;
// store backups there so that each worktree's backup is isolated from others'
export const BACKUP_STAGED_TREE_REF = `refs/worktree/${pkg.name}/${pkg.version}/backup-staged-tree`;
export const BACKUP_WORKING_TREE_REF = `refs/worktree/${pkg.name}/${pkg.version}/backup-working-tree`;

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
