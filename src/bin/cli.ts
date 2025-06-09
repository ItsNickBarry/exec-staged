#!/usr/bin/env node
import execStaged from '../index.js';
import { loadConfig } from '../lib/config.js';

const cwd = process.cwd();

// TODO: pass config in
const config = await loadConfig();

await execStaged(cwd);
