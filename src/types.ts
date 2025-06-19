export type ExitCode = 0 | 1;

export type ExecStagedConfigEntry = {
  task: string;
  diff: string;
  glob: string;
};

export type ExecStagedConfig = ExecStagedConfigEntry[];

type ExecStagedUserConfigEntry =
  | (Pick<ExecStagedConfigEntry, 'task'> & Partial<ExecStagedConfigEntry>)
  | ExecStagedConfigEntry['task'];

export type ExecStagedUserConfig = ExecStagedUserConfigEntry[];

export type StageOptions = {
  quiet?: boolean;
};
