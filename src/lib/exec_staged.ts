import type { ExitCode, StageOptions } from '../types.js';
import { Stage } from './stage.js';

export const execStaged = async (
  cwd: string,
  tasks: string[],
  options: StageOptions = {},
): Promise<ExitCode> => {
  try {
    const stage = new Stage(cwd, options);
    await stage.exec(tasks);
    return 0;
  } catch (error) {
    return 1;
  }
};
