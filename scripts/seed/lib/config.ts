// Reads the seed configuration from the environment (or a .env.seed file, see README).
import { readFileSync } from 'node:fs';
import { USERS, type UserKey } from '../story';

export type UserCreds = { email: string; token: string; bitbucketToken: string };

export type Config = {
  /** e.g. one-atlas-ubvd.atlassian.net */
  site: string;
  /** Meera's last day, YYYY-MM-DD. Due dates are relative to it. */
  lastDay: string;
  spaceKey: string;
  workspace: string;
  /** Bitbucket project for the repo. Premium workspaces require one. */
  bitbucketProject?: string;
  issueType: string;
  users: Record<UserKey, UserCreds>;
};

/** Loads KEY=value lines into process.env without overwriting what's already set. */
export const loadEnvFile = (path: string, env: NodeJS.ProcessEnv = process.env) => {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]!] === undefined) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const missing: string[] = [];
  const need = (name: string) => {
    const v = env[name]?.trim();
    if (!v) missing.push(name);
    return v ?? '';
  };

  const users = {} as Record<UserKey, UserCreds>;
  for (const key of Object.keys(USERS) as UserKey[]) {
    const p = `SEED_${key.toUpperCase()}`;
    const token = need(`${p}_TOKEN`);
    users[key] = { email: need(`${p}_EMAIL`), token, bitbucketToken: env[`${p}_BITBUCKET_TOKEN`]?.trim() || token };
  }

  const lastDay = env.SEED_LAST_DAY?.trim() || '2026-12-30';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) missing.push('SEED_LAST_DAY (as YYYY-MM-DD)');

  const config: Config = {
    site: need('SEED_SITE').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    lastDay,
    spaceKey: env.SEED_SPACE_KEY?.trim() || 'NWP',
    workspace: env.SEED_BITBUCKET_WORKSPACE?.trim() ?? '',
    bitbucketProject: env.SEED_BITBUCKET_PROJECT?.trim() || undefined,
    issueType: env.SEED_ISSUE_TYPE?.trim() || 'Task',
    users,
  };
  if (missing.length) throw new Error(`Missing seed settings: ${missing.join(', ')}. See scripts/README.md.`);
  return config;
};
