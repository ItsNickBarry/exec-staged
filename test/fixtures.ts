import pkg from '../package.json';
import envPaths from 'env-paths';
import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';

export const setup = async () => {
  const cwd = path.resolve(envPaths(pkg.name).temp, crypto.randomUUID());
  await fs.promises.rm(cwd, { recursive: true, force: true });
  await fs.promises.mkdir(cwd, { recursive: true });

  const git = simpleGit(cwd);
  await git.init();
  await git.commit('initial commit', ['--allow-empty']);

  return { cwd, git };
};
