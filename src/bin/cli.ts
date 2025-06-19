#!/usr/bin/env node
import pkg from '../../package.json' with { type: 'json' };
import { loadConfig } from '../lib/config.js';
import { execStaged } from '../lib/exec_staged.js';
import { program } from 'commander';
import path from 'node:path';

program.name(pkg.name).version(pkg.version).description(pkg.description);
program.option('--quiet', 'suppress output');
program.option('--cwd <cwd>', 'directory in which to run');
program.argument('[tasks...]');

program.parse(process.argv);

const options = program.opts();
const args = program.args;

const cwd = path.resolve(options.cwd ?? '');

const tasks = args.length ? args : await loadConfig(cwd);

process.exitCode = await execStaged(cwd, tasks, options);
