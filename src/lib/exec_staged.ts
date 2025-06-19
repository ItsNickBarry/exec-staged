import type { ExecStagedUserConfig, ExitCode, StageOptions } from '../types.js';
import { resolveConfig } from './config.js';
import { Stage } from './stage.js';

export const execStaged = async (
  cwd: string,
  tasks: ExecStagedUserConfig,
  options: StageOptions = {},
): Promise<ExitCode> => {
  try {
    const stage = new Stage(cwd, options);
    await stage.exec(resolveConfig(tasks));
    return 0;
  } catch (error) {
    return 1;
  }
};
