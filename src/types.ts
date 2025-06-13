export type ExitCode = 0 | 1;

export type Tasks =
  | string
  | Tasks[]
  | ((matches?: string) => Tasks)
  | ((matches?: string) => Promise<Tasks>);

export type ExecStagedConfig = {
  [globPattern: string]: Tasks;
};

export type StageOptions = {
  quiet?: boolean;
};
