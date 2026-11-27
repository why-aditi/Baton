// The LLM provider: Forge LLMs (Claude, hosted on Atlassian), so no data leaves Atlassian for AI
// features and the app has no external egress. Fast work uses a Haiku-class model, large work a
// Sonnet-class one; the exact model IDs are looked up at runtime, so deprecations don't break Baton.
import type { ChatResponse, ModelListResponse, Prompt } from '@forge/llm';
import type { Client, Tier } from './client';

export type ForgeChat = (prompt: Prompt) => Promise<ChatResponse>;
export type ForgeList = () => Promise<ModelListResponse>;

const CLASS_FOR: Record<Tier, string[]> = {
  fast: ['haiku', 'sonnet'],
  large: ['sonnet', 'opus', 'haiku'],
};

const MAX_TOKENS = 4000;
const TEMPERATURE = 0.2;

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (p?.type === 'text' ? String(p.text ?? '') : '')).join('');
  return '';
};

export const createForgeLlmClient = ({ chat, list }: { chat: ForgeChat; list: ForgeList }): Client => {
  let models: Promise<ModelListResponse['models']> | undefined;

  const modelFor = async (tier: Tier) => {
    models ??= list().then((r) => r.models ?? []);
    const active = (await models).filter((m) => m.status === 'active');
    for (const cls of CLASS_FOR[tier]) {
      const m = active.find((x) => x.class === cls);
      if (m) return m.model;
    }
    throw new Error('No active Forge LLM model is available');
  };

  return {
    async complete({ tier, messages }) {
      const res = await chat({
        model: await modelFor(tier),
        messages,
        max_completion_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      });
      const text = textOf(res.choices?.[0]?.message?.content);
      if (!text.trim()) throw new Error('Forge LLM returned an empty reply');
      return { text, provider: 'forge' };
    },
  };
};
