// Before any LLM call, people become placeholders (P1, P2…) and are mapped back afterwards,
// so no names, emails or account IDs leave Atlassian.

export type Person = { ari: string; name: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

export class Pseudonymizer {
  private byAri = new Map<string, string>();
  private people: (Person & { alias: string })[] = [];

  constructor(people: Person[]) {
    people.forEach((p) => this.add(p));
  }

  private add({ ari, name }: Person) {
    const alias = `P${this.people.length + 1}`;
    this.byAri.set(ari, alias);
    this.people.push({ ari, name, alias });
    return alias;
  }

  alias(ari: string): string {
    return this.byAri.get(ari) ?? this.add({ ari, name: ari });
  }

  scrub(text: string): string {
    // Longest strings first, so "Meera Iyer" wins over "Meera".
    const terms: [string, string][] = [];
    for (const p of this.people) {
      const first = p.name.split(/\s+/)[0]!;
      terms.push([p.ari, p.alias], [p.name, p.alias], [first, p.alias], [p.ari.slice(p.ari.lastIndexOf('/') + 1), p.alias]);
    }
    terms.sort((a, b) => b[0].length - a[0].length);

    let out = text.replace(EMAIL, '[email]');
    for (const [term, alias] of terms) {
      if (!term) continue;
      out = out.replace(new RegExp(`(?<![\\w])${escape(term)}(?![\\w])`, 'g'), alias);
    }
    return out;
  }

  restore(text: string): string {
    return text.replace(/\bP(\d+)\b/g, (m, n) => this.people[Number(n) - 1]?.name ?? m);
  }

  restoreAri(alias: string): string | null {
    const m = alias.match(/^P(\d+)$/);
    return (m && this.people[Number(m[1]) - 1]?.ari) ?? null;
  }
}
