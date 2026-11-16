import type { Output, Task } from './schemas';
import { validateOutput } from './validate';

export type Tier = 'fast' | 'large';
export type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export type Provider = {
  name: string;
  /** OpenAI-compatible base URL, without the trailing /chat/completions. */
  baseUrl: string;
  apiKey?: string;
  models: Record<Tier, string>;
};

/** The subset of fetch we use, so tests can pass a fake and production passes Forge's fetch. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;

export type Client = {
  complete(req: { tier: Tier; messages: Message[] }): Promise<{ text: string; provider: string }>;
};

/**
 * Tries each provider in order. Any failure (429, 5xx, a 400 such as Groq's json_validate_failed,
 * or a network error) moves on to the next one; providers without a key are skipped.
 */
export const createClient = ({ fetch, providers }: { fetch: FetchLike; providers: Provider[] }): Client => ({
  async complete({ tier, messages }) {
    const failures: string[] = [];
    for (const p of providers) {
      if (!p.apiKey) continue;
      try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: p.models[tier], messages, response_format: { type: 'json_object' } }),
        });
        if (!res.ok) {
          failures.push(`${p.name}: HTTP ${res.status}`);
          continue;
        }
        const body = await res.json();
        const text = body?.choices?.[0]?.message?.content;
        if (typeof text !== 'string') {
          failures.push(`${p.name}: no message content`);
          continue;
        }
        return { text, provider: p.name };
      } catch (e) {
        failures.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    throw new Error(`All LLM providers failed (${failures.join('; ') || 'no provider has a key'})`);
  },
});

/**
 * Completes, validates and grounds the output, retrying once with the validation error.
 * Returns null instead of throwing: LLM output is an enhancement and must never block the flow.
 */
export const completeValidated = async <T extends Task>(
  client: Client,
  req: { task: T; tier: Tier; messages: Message[]; known: Set<string> },
): Promise<Output<T> | null> => {
  let messages = req.messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      ({ text } = await client.complete({ tier: req.tier, messages }));
    } catch (e) {
      console.warn('LLM unavailable', e instanceof Error ? e.message : e);
      return null;
    }
    const result = validateOutput(req.task, text, req.known);
    if (result.ok) return result.value;
    console.warn(`LLM ${req.task} output rejected`, result.error);
    messages = [...req.messages, { role: 'assistant', content: text }, { role: 'user', content: result.error }];
  }
  return null;
};
