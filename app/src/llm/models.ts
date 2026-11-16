import type { Provider } from './client';

// The Groq account has no Llama models (see SETUP-KESHAV.md). Mistral IDs are the console's
// "latest" aliases; pin them before judging starts so behavior can't shift under us.
export const providersFromEnv = (env: Record<string, string | undefined> = process.env): Provider[] => [
  {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: env.GROQ_API_KEY,
    models: { fast: 'openai/gpt-oss-20b', large: 'openai/gpt-oss-120b' },
  },
  {
    name: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: env.MISTRAL_API_KEY,
    models: { fast: 'mistral-small-latest', large: 'mistral-large-latest' },
  },
];
