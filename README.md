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

`exec-staged` configuration consists of a list of commands to execute against the stage. Each command may be formatted as a plain `string`, or as an object containing additional attributes.

All [Cosmiconfig-compatible](https://www.npmjs.com/package/cosmiconfig#searchplaces) configuration files are supported.

Here is an example configuration:

```typescript
// exec-staged.config.ts
import type { ExecStagedUserConfig } from 'exec-staged/types';

const config: ExecStagedUserConfig = [
  'knip',
  'knip --production',
  { task: 'prettier --write $STAGED_FILES', glob: '*.{js,ts,json,md}' },
];

export default config;
```

Plain commands are run every time, as-is:

<!-- prettier-ignore-start -->
```typescript
'knip --production'
```
<!-- prettier-ignore-end -->

Commands which include the `$STAGED_FILES` token are only run if staged files are found, and those files are interpolated into the command in place of the token.

<!-- prettier-ignore-start -->
```typescript
'prettier --write $STAGED_FILES'
// => prettier --write new_file.js modified_file.js
```
<!-- prettier-ignore-end -->

File filtering can be customized.

To filter files by name, add a `glob` filter (defaults to `'*'`):

```typescript
{ task: 'prettier --write $STAGED_FILES', glob: '*.{js,ts,json,md}' }
```

To filter files by git status, add a `diff` filter (defaults to `'ACMR'`; see [here](https://git-scm.com/docs/git-status#_short_format)):

```typescript
{ task: 'prettier --write $STAGED_FILES', diff: 'A' }
```

Defining `diff` or `glob` on a task that does not include the `$STAGED_FILES` token has no effect:

```typescript
{ task: 'knip', diff: 'NO EFFECT', glob: 'NO EFFECT' }
```

## Safety Features

Before running any potentially destructive scripts, `exec-staged` stores all outstanding changes, including untracked files, in a backup stash. If any task fails, or if `exec-staged` is interrupted by an end-process signal (such as via <kbd>Ctrl + C</kbd>), the repository's original state is restored using this stash. Avoid running any tasks that interact with git, especially those that make commits or modify the stash.

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

To prevent data loss, `exec-staged` will not run if a stash or commit from a previous run is present.

## See Also

- [`lint-staged`](https://github.com/lint-staged/lint-staged): the inspiration for `exec-staged`.
- [`knip`](https://github.com/webpro-nl/knip): a linter that analyzes interactions between files, which is outside of the designed scope of `lint-staged`.
