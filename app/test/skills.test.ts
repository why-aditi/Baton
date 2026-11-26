// Keeps the Rovo skills in step with the manifest, using the same rules forge deploy applies
// (@forge/manifest's rovo:skill validators), so a broken skill fails here first.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

const root = new URL('..', import.meta.url).pathname;
const manifest = parse(readFileSync(join(root, 'manifest.yml'), 'utf8'));
const skills: { key: string; source: { dir: string }; dependencies: { tools: string[] } }[] = manifest.modules['rovo:skill'] ?? [];
const actionKeys = new Set<string>(manifest.modules.action.map((a: { key: string }) => a.key));
const agent = manifest.modules['rovo:agent'][0];

const readSkill = (dir: string) => {
  const text = readFileSync(join(root, dir, 'SKILL.md'), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${dir}/SKILL.md has no frontmatter`);
  return { frontmatter: parse(m[1]!) as Record<string, unknown>, body: m[2]! };
};

test('the spec asks for get-handover and find-owner to be wrapped as skills', () => {
  const wrapped = skills.flatMap((s) => s.dependencies.tools);
  expect(wrapped).toContain('get-handover');
  expect(wrapped).toContain('find-owner');
});

test('the agent can use every skill', () => {
  expect(new Set(agent.skills)).toEqual(new Set(skills.map((s) => s.key)));
});

describe.each(skills.map((s) => [s.key, s] as const))('skill %s', (_key, skill) => {
  test('its directory has a SKILL.md', () => {
    expect(existsSync(join(root, skill.source.dir, 'SKILL.md'))).toBe(true);
  });

  test('depends only on real actions', () => {
    for (const t of skill.dependencies.tools) expect(actionKeys.has(t)).toBe(true);
  });

  test('frontmatter: name matches the directory, description is 50 to 1024 characters, only known fields', () => {
    const { frontmatter } = readSkill(skill.source.dir);
    expect(frontmatter.name).toBe(basename(skill.source.dir));
    expect(frontmatter.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const d = String(frontmatter.description ?? '');
    expect(d.length).toBeGreaterThanOrEqual(50);
    expect(d.length).toBeLessThanOrEqual(1024);
    for (const k of Object.keys(frontmatter)) {
      expect(['name', 'description', 'compatibility', 'metadata', 'license', 'allowed-tools']).toContain(k);
    }
  });

  test('allowed-tools matches the manifest dependencies', () => {
    const tools = String(readSkill(skill.source.dir).frontmatter['allowed-tools'] ?? '').split(' ').sort();
    expect(tools).toEqual([...skill.dependencies.tools].sort());
  });

  test('the body explains every tool and stays under 500 lines', () => {
    const { body } = readSkill(skill.source.dir);
    for (const t of skill.dependencies.tools) expect(body).toMatch(new RegExp(`\\b${t}\\b`));
    expect(body.split('\n').length).toBeLessThanOrEqual(500);
  });
});
