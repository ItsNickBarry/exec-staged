#!/usr/bin/env node
import execStaged from '../index.js';

const cwd = process.cwd();

await execStaged(cwd);
