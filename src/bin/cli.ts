#!/usr/bin/env node
import execStaged from '../index.js';
import { loadConfig, parseTasks } from '../lib/config.js';

const cwd = process.cwd();
const config = await loadConfig(cwd);

const configTasks = await parseTasks(Object.values(config));

const tasks = process.argv.length > 2 ? process.argv.slice(2) : configTasks;

process.exitCode = await execStaged(cwd, tasks);
