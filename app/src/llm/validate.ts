import { schemas, type Output, type Task } from './schemas';

export type Validated<T extends Task> =
  | { ok: true; value: Output<T>; unknownAris: string[] }
  | { ok: false; error: string };

/** Above this share of invented item ARIs, the whole output is rejected and the call retried. */
const MAX_UNKNOWN_SHARE = 0.2;
const MIN_QUESTIONS = 5;

const parseJson = (raw: string): unknown => {
  const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1]! : raw);
};

/**
 * Parses LLM text, checks it against the task's schema and grounds it: every item ARI must be one
 * we sent. Unknown ARIs are stripped; if more than 20% are unknown, the output is rejected with an
 * error message suitable for a single retry.
 */
export const validateOutput = <T extends Task>(task: T, raw: string, known: Set<string>): Validated<T> => {
  let json: unknown;
  try {
    json = parseJson(raw);
  } catch {
    return { ok: false, error: 'Output was not valid JSON. Reply with a single JSON object only.' };
  }

  const parsed = schemas[task].safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return { ok: false, error: `Output did not match the schema. ${issues.join('; ')}` };
  }

  const unknown: string[] = [];
  let total = 0;
  const keep = (ari: string) => {
    total++;
    if (known.has(ari)) return true;
    unknown.push(ari);
    return false;
  };

  const value = structuredClone(parsed.data) as Output<Task>;
  if ('questions' in value) {
    value.questions = value.questions
      .map((q) => ({ ...q, itemAris: q.itemAris.filter(keep) }))
      .filter((q) => q.itemAris.length > 0);
  } else if ('items' in value) {
    value.items = value.items.filter((i) => keep(i.ari));
  } else {
    value.sections = value.sections.map((s) => ({ ...s, itemAris: s.itemAris.filter(keep) }));
  }

  if (total > 0 && unknown.length / total > MAX_UNKNOWN_SHARE) {
    return {
      ok: false,
      error: `These item ARIs are not in the input: ${unknown.join(', ')}. Use only ARIs from the items provided.`,
    };
  }
  if ('questions' in value && value.questions.length < MIN_QUESTIONS) {
    return { ok: false, error: `Need at least ${MIN_QUESTIONS} questions, each linked to items from the input.` };
  }

  return { ok: true, value: value as Output<T>, unknownAris: unknown };
};
