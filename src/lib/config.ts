import pkg from '../../package.json' with { type: 'json' };
import type { ExecStagedConfig, ExecStagedUserConfig } from '../types.js';
import { DEFAULT_CONFIG_ENTRY } from './constants.js';
import { lilconfig } from 'lilconfig';

export const loadConfig = async (
  cwd: string,
): Promise<ExecStagedUserConfig> => {
  const configResult = await lilconfig(pkg.name).search(cwd);

  if (configResult) {
    const { config, filepath } = configResult;

    console.log(`Config loaded from ${filepath}`);

    // TODO: validate

    return config;
  } else {
    console.log('No config found');
    return [];
  }
};

export const resolveConfig = (
  userConfig: ExecStagedUserConfig,
): ExecStagedConfig => {
  return userConfig.map((entry) => ({
    ...DEFAULT_CONFIG_ENTRY,
    ...(typeof entry === 'string' ? { task: entry } : entry),
  }));
};
