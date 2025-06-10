export type Tasks =
  | string
  | Tasks[]
  | ((matches?: string) => Tasks)
  | ((matches?: string) => Promise<Tasks>);

export type ExecStagedConfig = {
  [globPattern: string]: Tasks;
};
