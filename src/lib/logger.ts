import pkg from '../../package.json' with { type: 'json' };
import envPaths from 'env-paths';
import fs from 'node:fs';
import path from 'node:path';

export class Logger {
  private quiet: boolean;
  private outFile: string;

  constructor(quiet: boolean = false) {
    this.quiet = quiet;
    this.outFile = path.resolve(
      envPaths(pkg.name).temp,
      `debug-${new Date().getTime().toString()}.txt`,
    );
    fs.mkdirSync(path.dirname(this.outFile), { recursive: true });
    this.debug(`${pkg.name} log: ${new Date().toLocaleString()}`);
  }

  public log(...params: Parameters<typeof console.log>): void {
    this.debug(...params);

    if (!this.quiet) {
      console.log(...params);
    }
  }

  public debug(...params: Parameters<typeof console.debug>): void {
    fs.appendFileSync(this.outFile, params.join('\n') + '\n');
  }
}
