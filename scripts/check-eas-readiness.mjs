import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const mobile = resolve(root, 'apps/mobile');
const checks = [];

function command(name, args, cwd = root) {
  return spawnSync(name, args, { cwd, encoding: 'utf8', env: process.env });
}

function check(name, ok, detail, action) {
  checks.push({ name, ok, detail, ...(ok || !action ? {} : { action }) });
}

const mobilePackage = JSON.parse(readFileSync(resolve(mobile, 'package.json'), 'utf8'));
const easConfig = JSON.parse(readFileSync(resolve(mobile, 'eas.json'), 'utf8'));
check(
  'pinnedCli',
  mobilePackage.scripts?.eas === 'pnpm dlx eas-cli@20.5.1',
  mobilePackage.scripts?.eas ?? 'missing',
  'Restore the pinned apps/mobile eas script',
);
for (const profile of ['development', 'preview', 'production'])
  check(
    `profile:${profile}`,
    Boolean(easConfig.build?.[profile]),
    easConfig.build?.[profile] ? 'configured' : 'missing',
    `Add build.${profile} to apps/mobile/eas.json`,
  );
check(
  'developmentClient',
  easConfig.build?.development?.developmentClient === true &&
    easConfig.build?.development?.distribution === 'internal',
  'Development Build must use developmentClient=true and internal distribution',
  'Correct apps/mobile/eas.json before creating a build',
);
check(
  'singleLockfile',
  existsSync(resolve(root, 'pnpm-lock.yaml')) && !existsSync(resolve(mobile, 'pnpm-lock.yaml')),
  'Monorepo root lockfile must be the only pnpm lockfile',
  'Remove apps/mobile/pnpm-lock.yaml and reinstall from the repository root',
);

const git = command('git', ['rev-parse', '--show-toplevel']);
const correctGitRoot = git.status === 0 && resolve(git.stdout.trim()) === root;
check(
  'gitRepository',
  correctGitRoot,
  git.status === 0 ? `root=${git.stdout.trim()}` : 'not initialized',
  'Initialize a Git repository at the cat-diary root and create the reviewed initial commit',
);
const gitHead = correctGitRoot ? command('git', ['rev-parse', '--verify', 'HEAD']) : null;
check(
  'gitCommit',
  gitHead?.status === 0,
  gitHead?.status === 0 ? gitHead.stdout.trim().slice(0, 12) : 'no initial commit',
  'Review the files and create the initial commit before EAS uploads the repository',
);

const easVersion = command('pnpm', ['eas', '--version']);
check(
  'cliExecutable',
  easVersion.status === 0 && /eas-cli\/20\.5\.1\b/.test(easVersion.stdout),
  (easVersion.stdout || easVersion.stderr).trim(),
  'Run pnpm install --frozen-lockfile',
);

if (!process.argv.includes('--local-only')) {
  const whoami = command('pnpm', ['eas', 'whoami']);
  check(
    'expoLogin',
    whoami.status === 0,
    whoami.status === 0 ? whoami.stdout.trim() : 'not logged in',
    'Run pnpm eas login',
  );
  if (whoami.status === 0) {
    const project = command('pnpm', ['eas', 'project:info', '--json', '--non-interactive']);
    check(
      'easProject',
      project.status === 0,
      project.status === 0 ? 'linked' : (project.stderr || project.stdout).trim(),
      'Run pnpm eas init, then configure EAS_PROJECT_ID',
    );
  } else {
    check('easProject', false, 'not checked because Expo login is missing', 'Log in first');
  }
}

console.log(JSON.stringify({ ready: checks.every((item) => item.ok), checks }, null, 2));
if (checks.some((item) => !item.ok)) process.exitCode = 1;
