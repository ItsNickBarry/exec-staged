#!/usr/bin/env node
import execStaged from '../index.js';
import { loadConfig } from '../lib/config.js';

const cwd = process.cwd();

const config: { [key: string]: string[] } = await loadConfig();

// const tasks = Object.values(config).flat();
const tasks = [process.argv[2] ?? ['prettier --write .', 'knip']].flat();

await execStaged(cwd, tasks);
