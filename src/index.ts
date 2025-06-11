import { Stage } from './lib/stage.js';
import type { ExitCode } from './types.js';

export default async (cwd: string, tasks: string[]): Promise<ExitCode> => {
  try {
    const stage = new Stage(cwd);
    await stage.exec(tasks);
    return 0;
  } catch (error) {
    return 1;
  }
};
