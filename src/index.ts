import { Stage } from './lib/stage.js';

export default async (cwd: string, tasks: string[]): Promise<number> => {
  try {
    const stage = new Stage(cwd);
    await stage.exec(tasks);
    return 0;
  } catch (error) {
    return 1;
  }
};
