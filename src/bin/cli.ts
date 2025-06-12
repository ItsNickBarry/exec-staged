#!/usr/bin/env node
import { loadConfig, parseTasks } from '../lib/config.js';
import { execStaged } from '../lib/exec_staged.js';

const cwd = process.cwd();
const config = await loadConfig(cwd);

const configTasks = await parseTasks(Object.values(config));

const tasks = process.argv.length > 2 ? process.argv.slice(2) : configTasks;

process.exitCode = await execStaged(cwd, tasks);
