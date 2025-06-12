import type { ExitCode } from '../types.js';
import { Stage } from './stage.js';

export const execStaged = async (
  cwd: string,
  tasks: string[],
): Promise<ExitCode> => {
  try {
    const stage = new Stage(cwd);
    await stage.exec(tasks);
    return 0;
  } catch (error) {
    return 1;
  }
};
