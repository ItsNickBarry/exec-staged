import { execa, execaSync } from 'execa';
import { onExit } from 'signal-exit';

/**
 * Spawn a child process asynchronously using the `execa` package.
 * This is used to run `exec-staged` tasks.  The `execa` package is
 * required because it provides the `preferLocal` option.
 *
 * Child processes are configured to be killed if the main process is stopped.
 *
 * @param cwd Directory where command should be executed.
 * @param args Command string or array of command tokens.
 * @throws ExecaError
 * @returns Execa `Result` promise.
 */
export const spawn = async (cwd: string, args: string[]) => {
  const subprocess = execa({
    cwd,
    preferLocal: true,
    stdout: ['pipe', 'inherit'],
  })(args[0], args.slice(1));

  const removeExitHandler = onExit(() => {
    subprocess.kill();
  });
  subprocess.nodeChildProcess.once('close', removeExitHandler);

  return subprocess;
};

/**
 * Spawn a child process synchronously using the `execa` package.
 * This is used to run `git` commands.  A synchronous API is required because
 * cleanup operations may be run via `signal-exit`.
 *
 * @param cwd Directory where command should be executed.
 * @param args Command string or array of command tokens.
 * @param env Environment variables to set, in addition to those of the current
 * process.
 * @throws ExecaSyncError
 * @returns Execa `SyncResult`.
 */
export const spawnSync = (
  cwd: string,
  args: string[],
  env?: Record<string, string>,
) => {
  return execaSync({ cwd, env })(args[0], args.slice(1));
};
