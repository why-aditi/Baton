// Local preview with test data, outside Forge: npm run dev, then open /preview.html (add ?theme=dark).
import '@atlaskit/css-reset';
import { setGlobalTheme } from '@atlaskit/tokens/set-global-theme';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { handover } from './fixtures';
const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
void setGlobalTheme({ colorMode: theme }).then(() => {
  const h = handover();
  createRoot(document.getElementById('root')!).render(
    <App route={{ name: 'handover', id: 'h1' }} platform={{
      api: { getHandover: async () => ({ role: 'editor', handover: h }), setOwner: async () => h } as any,
      invokeRaw: async () => ({}), graph: async () => ({}), navigate: () => {}, openUrl: () => {}, now: () => new Date('2026-11-23T00:00:00Z'),
    }} />);
});
