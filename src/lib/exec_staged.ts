import type { ExecStagedUserConfig, StageOptions } from '../types.js';
import { resolveConfig } from './config.js';
import { Stage } from './stage.js';

export const execStaged = async (
  cwd: string,
  tasks: ExecStagedUserConfig,
  options: StageOptions = {},
): Promise<boolean> => {
  try {
    const stage = new Stage(cwd, options);
    await stage.exec(resolveConfig(tasks));
    return true;
  } catch (error) {
    return false;
  }
};
