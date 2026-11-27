// The LLM client interface, and validation with one grounded retry. The provider is Forge LLMs
// (src/llm/forgeLlm.ts); tests pass fakes.
import type { Output, Task } from './schemas';
import { validateOutput } from './validate';

export type Tier = 'fast' | 'large';
export type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export type Client = {
  complete(req: { tier: Tier; messages: Message[] }): Promise<{ text: string; provider: string }>;
};

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
