import nanoSpawn, { SubprocessError } from 'nano-spawn';
import child_process from 'node:child_process';
import parseArgsStringToArgv from 'string-argv';

/**
 * Spawn a child process synchronously.
 * This is used to run `git` commands.  A synchronous API is required because
 * cleanup operations may be run via `on-process-exit`.
 *
 * @param cwd Directory where command should be executed.
 * @param args Command string or array of command tokens.
 * @throws SubprocessError
 * @returns The stdout of the spawned process.
 */
export const spawnSync = (cwd: string, args: string | string[]): string => {
  if (typeof args === 'string') {
    args = parseArgsStringToArgv(args);
  }

  const result = child_process.spawnSync(args[0], args.slice(1), {
    cwd,
  });

  const { status, signal, stdout } = result;

  // throw failure as SubprocessError to match the behavior of nano-spawn

  if (signal) {
    throw new SubprocessError(
      `Command was terminated with ${signal}: ${args.join(' ')}`,
    );
  }

  if (status) {
    throw new SubprocessError(
      `Command failed with exit code ${status}: ${args.join(' ')}`,
    );
  }

  return stdout.toString();
};

/**
 * Spawn a child process asynchronously using `nano-spawn`.
 * This is used to run `exec-staged` tasks.  The `nano-spawn` package is
 * required because it provides the `preferLocal` option.
 *
 * @param cwd Directory where command should be executed.
 * @param args Command string or array of command tokens.
 * @throws SubprocessError
 * @returns The stdout of the spawned process.
 */
export const spawn = async (
  cwd: string,
  args: string | string[],
): Promise<string> => {
  if (typeof args === 'string') {
    args = parseArgsStringToArgv(args);
  }

  const result = await nanoSpawn(args[0], args.slice(1), {
    cwd,
    preferLocal: true,
    stdio: 'inherit',
  });

  return result.stdout;
};
