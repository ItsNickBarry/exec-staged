#!/usr/bin/env node
import pkg from '../../package.json' with { type: 'json' };
import { loadConfig } from '../lib/config.js';
import { execStaged, recoverStaged } from '../lib/exec_staged.js';
import { program } from 'commander';
import path from 'node:path';

program.name(pkg.name).version(pkg.version).description(pkg.description);
program.option('--quiet', 'suppress output');
program.option('--cwd <cwd>', 'directory in which to run');

program
  .command('run', { isDefault: true })
  .argument('[tasks...]')
  .action(async (args: string[]) => {
    const options = program.opts();
    const cwd = path.resolve(options.cwd ?? '');

    const tasks = args.length ? args : await loadConfig(cwd);

    const result = await execStaged(cwd, tasks, options);

    if (!result) {
      process.exitCode ||= 1;
    }
  });

program
  .command('recover')
  .description('Recover from a failed exec-staged run')
  .action(() => {
    const options = program.opts();
    const cwd = path.resolve(options.cwd ?? '');

    const result = recoverStaged(cwd);

    if (!result) {
      process.exitCode ||= 1;
    }
  });

program.parse(process.argv);
