import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { Q } from '../src/graph/queries';

// schema.json: { TypeName: { kind, fields: { name: "Type" | { type, args } }, enumValues? } }
const schema = JSON.parse(readFileSync(new URL('./fixtures/schema.json', import.meta.url), 'utf8'));

/** Strips NON_NULL<…> and LIST<…> wrappers. */
const baseType = (t: string): string => t.replace(/^(NON_NULL|LIST)<(.*)>$/, '$2').replace(/^(NON_NULL|LIST)<(.*)>$/, '$2').replace(/^(NON_NULL|LIST)<(.*)>$/, '$2');
const fieldType = (f: unknown) => baseType(typeof f === 'string' ? f : (f as { type: string }).type);

/** Walks a selection set, checking each field exists on the current type. Returns the problems. */
const check = (query: string): string[] => {
  const problems: string[] = [];
  const body = query.slice(query.indexOf('{'));
  const tokens = body.match(/\.\.\.\s*on\s+\w+|\w+\s*\([^)]*\)|\w+|[{}]/g) ?? [];
  const stack: string[] = [];
  let current = 'Query';
  let last: string | null = null;

  for (const tok of tokens) {
    if (tok === '{') {
      stack.push(current);
      if (last) current = last;
      last = null;
    } else if (tok === '}') {
      current = stack.pop()!;
      last = null;
    } else if (tok.startsWith('...')) {
      last = tok.replace(/\.\.\.\s*on\s+/, '');
      if (!schema[last]) problems.push(`unknown type ${last}`);
    } else {
      const name = tok.match(/^\w+/)![0];
      if (name === '__typename') {
        last = null;
        continue;
      }
      const f = schema[current]?.fields?.[name];
      if (!f) {
        problems.push(`${current}.${name} does not exist`);
        last = null;
        continue;
      }
      const args = [...tok.matchAll(/(\w+)\s*:/g)].map((m) => m[1]!);
      for (const a of args) {
        if (typeof f === 'string' || !(a in (f.args ?? {}))) problems.push(`${current}.${name}(${a}) is not an argument`);
      }
      last = fieldType(f);
    }
  }
  return problems;
};

describe('graph queries match the recorded schema', () => {
  test.each(Object.entries(Q))('%s', (_name, query) => {
    expect(check(query)).toEqual([]);
  });

  test.each(Object.entries(Q))('%s pages with $after and never selects edges.cursor', (_name, query) => {
    expect(query).toMatch(/\$after: String/);
    expect(query).toMatch(/after: \$after/);
    expect(query).not.toMatch(/edges\s*\{\s*cursor|cursor\s+node/);
  });

  test.each(Object.entries(Q))('%s has a company_operation name', (_name, query) => {
    expect(query).toMatch(/^query baton_\w+\(/);
  });

  test('the checker catches a wrong field and a wrong argument', () => {
    expect(check('query x { atlassianUserInTeams(userId: $u, bogus: 1) { edges { node { ... on AtlassianTeam { title } } } } }')).toEqual([
      'Query.atlassianUserInTeams(bogus) is not an argument',
      'AtlassianTeam.title does not exist',
    ]);
  });

  test('email is never selected', () => {
    for (const q of Object.values(Q)) expect(q).not.toMatch(/\bemail\b/);
  });
});
