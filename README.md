# Exec Staged

Run commands against files staged in git. Ignore unstaged changes and untracked files.

## Installation

Install from npm, using your preferred package manager:

```bash
npm install --save-dev exec-staged
```

## Usage

### Run from the CLI

If an `exec-staged` configuration file is present, it will be loaded by the executable:

```bash
npx exec-staged
```

If no configuration is present, the executable can still run tasks passed as arguments:

```bash
npx exec-staged "npm test"
```

### Run in a Script

```typescript
import { execStaged } from 'exec-staged';

const cwd = process.cwd();
const tasks = [`npm test`];
const options = { quiet: true };

const exitCode = await execStaged(cwd, tasks, options);

if (exitCode === 1) {
  throw new Error('exec-staged task failed');
}
```

### Run in a Pre-Commit Hook

[Husky](https://github.com/typicode/husky) is recommended for handling pre-commit hooks.

Install Husky:

```bash
npm install --save-dev husky
```

Add a hook to `.husky/pre-commit`:

```bash
#!/bin/sh
npx exec-staged
```

Run husky:

```bash
npx husky
```

Add a `package.json` script to run husky whenever your repository is cloned:

```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

`exec-staged` will do nothing unless configured. See configuration information below.

## Configuration

TODO

## Safety Features

Before running any potentially desctructive scripts, `exec-staged` stores all outstanding changes, including untracked files, in a backup stash. If any task fails, or if `exec-staged` is interrupted by an end-process signal (such as via <kbd>Ctrl</kbd> + <kbd>C</kbd>), the repository's original state is restored using this stash.

### Recovery

If `exec-staged` fails to exit safely, such as due to power loss or if its process is killed via `SIGKILL`, its backup stash should still be present.

To verify, run `git log` and look for a stash with the message `💾 exec-staged backup stash`. It should be the most recent stash. If it isn't, one of your tasks probably created a stash for some reason. This is very unlikely. Remove any such stashes before proceeding.

`exec-staged` also creates a short-lived temporary commit with the message `💾 exec-staged staged changes`. If it's present, it can be removed with `git reset --hard HEAD~1`.

The following commands should return your repository to its original state:

```bash
git add -A
git reset --hard HEAD
git stash pop --index
```

## See Also

- [`lint-staged`](https://github.com/lint-staged/lint-staged): the inspiration for `exec-staged`.
- [`knip`](https://github.com/webpro-nl/knip): a linter that analyzes interactions between files, which is outside of the designed scope of `lint-staged`.
