import pkg from '../../package.json' with { type: 'json' };
import type { ExecStagedConfig, Tasks } from '../types.js';
import { lilconfig } from 'lilconfig';

export const loadConfig = async (cwd: string): Promise<ExecStagedConfig> => {
  const configResult = await lilconfig(pkg.name).search(cwd);

  if (configResult) {
    const { config, filepath } = configResult;

    console.log(`Config loaded from ${filepath}`);

    // TODO: validate

    return config;
  } else {
    console.log('No config found');
    return {};
  }
};

export const parseTasks = async (tasks: Tasks): Promise<string[]> => {
  if (typeof tasks === 'string') {
    return [tasks];
  }

  if (typeof tasks === 'function') {
    tasks = await tasks();
  }

  tasks = [tasks].flat();

  return (await Promise.all(tasks.map(parseTasks))).flat();
};
