import { expect, test } from 'vitest';
import { Pseudonymizer } from '../src/llm/pseudonymize';

const people = [
  { ari: 'ari:cloud:identity::user/meera', name: 'Meera Iyer' },
  { ari: 'ari:cloud:identity::user/arjun', name: 'Arjun' },
];

test('gives people stable placeholders in the order they are added', () => {
  const p = new Pseudonymizer(people);
  expect(p.alias('ari:cloud:identity::user/meera')).toBe('P1');
  expect(p.alias('ari:cloud:identity::user/arjun')).toBe('P2');
  expect(p.alias('ari:cloud:identity::user/meera')).toBe('P1');
});

test('an unknown person gets the next placeholder', () => {
  expect(new Pseudonymizer(people).alias('ari:cloud:identity::user/new')).toBe('P3');
});

test('scrubs full names, first names, account IDs and ARIs from text', () => {
  const p = new Pseudonymizer(people);
  const text = "Meera Iyer's runbook; ask Meera or Arjun (ari:cloud:identity::user/arjun), id meera";
  expect(p.scrub(text)).toBe("P1's runbook; ask P1 or P2 (P2), id P1");
});

test('scrubbing does not touch names inside other words', () => {
  expect(new Pseudonymizer(people).scrub('Arjuna and Meerakat')).toBe('Arjuna and Meerakat');
});

test('scrubs email addresses', () => {
  expect(new Pseudonymizer([]).scrub('mail meera+test@northwind.dev now')).toBe('mail [email] now');
});

test('restore maps placeholders back to names, longest first', () => {
  const many = Array.from({ length: 12 }, (_, n) => ({ ari: `u${n}`, name: `Name${n}` }));
  const p = new Pseudonymizer(many);
  expect(p.restore('P1 hands off to P12')).toBe('Name0 hands off to Name11');
});

test('restoreAri maps a placeholder back to the person ARI, or null', () => {
  const p = new Pseudonymizer(people);
  expect(p.restoreAri('P2')).toBe('ari:cloud:identity::user/arjun');
  expect(p.restoreAri('P9')).toBeNull();
});
