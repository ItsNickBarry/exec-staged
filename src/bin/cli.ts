#!/usr/bin/env node
import execStaged from '../index.js';
import { loadConfig, parseTasks } from '../lib/config.js';

const cwd = process.cwd();

const config = await loadConfig(cwd);

const configTasks = await parseTasks(Object.values(config));

// const tasks = Object.values(config).flat();
const tasks = [process.argv[2] ?? ['prettier --write .', 'knip']].flat();

const status = await execStaged(cwd, tasks);

process.exit(status);
