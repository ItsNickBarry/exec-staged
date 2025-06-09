import pkg from '../../package.json' with { type: 'json' };
import { lilconfig } from 'lilconfig';

export const loadConfig = async () => {
  const configResult = await lilconfig(pkg.name).search();

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
