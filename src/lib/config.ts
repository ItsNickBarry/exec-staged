import pkg from '../../package.json' with { type: 'json' };
import type {
  ExecStagedConfig,
  ExecStagedUserConfig,
  ExecStagedUserConfigEntry,
} from '../types.js';
import { DEFAULT_CONFIG_ENTRY } from './constants.js';
import { cosmiconfig } from 'cosmiconfig';

export const loadConfig = async (
  cwd: string,
): Promise<ExecStagedUserConfig> => {
  const configResult = await cosmiconfig(pkg.name).search(cwd);

  if (configResult) {
    const { config, filepath } = configResult;

    console.log(`Config loaded from ${filepath}`);

    validateUserConfig(config);

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

/** @internal */
export const validateUserConfig = (userConfig: ExecStagedUserConfig) => {
  if (!isValidUserConfig(userConfig)) {
    throw new Error('invalid config');
  }
};

const isValidUserConfig = (userConfig: ExecStagedUserConfig): boolean => {
  return (
    Array.isArray(userConfig) &&
    userConfig.every((userConfigEntry) =>
      isValidUserConfigEntry(userConfigEntry),
    )
  );
};

const isValidUserConfigEntry = (
  userConfigEntry: ExecStagedUserConfigEntry,
): boolean => {
  if (typeof userConfigEntry === 'string') return true;
  if (typeof userConfigEntry !== 'object') return false;
  if (typeof userConfigEntry.task !== 'string') return false;
  if (
    typeof userConfigEntry.diff !== 'string' &&
    typeof userConfigEntry.diff !== 'undefined'
  )
    return false;
  if (
    typeof userConfigEntry.glob !== 'string' &&
    typeof userConfigEntry.glob !== 'undefined'
  )
    return false;
  return true;
};
