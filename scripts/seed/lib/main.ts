// Shared entry point for the seed scripts: loads scripts/.env.seed, builds the config, runs, and
// prints a clear error instead of a stack trace for setup problems.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, loadEnvFile, type Config } from './config';
import type { FetchLike } from './http';

export type Context = { config: Config; fetch: FetchLike; log: (line: string) => void };

/** True when the module at `metaUrl` is the script node was started with. */
export const isMain = (metaUrl: string) => !!process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href;

export const runScript = async (name: string, fn: (ctx: Context) => Promise<void>) => {
  loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.seed'));
  try {
    const config = loadConfig();
    console.log(`${name} on ${config.site}`);
    await fn({ config, fetch: globalThis.fetch as unknown as FetchLike, log: (l) => console.log(l) });
  } catch (e) {
    console.error(`\n${name} failed: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
};
