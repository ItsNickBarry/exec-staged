import child_process from 'node:child_process';

export class Git {
  private readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  public exec(args: string[]) {
    const { status, stdout, stderr } = child_process.spawnSync('git', args, {
      cwd: this.cwd,
    });

    if (status) {
      throw new Error(`git error: ${stderr}`);
    } else {
      return stdout.toString();
    }
  }
}
