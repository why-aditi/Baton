// DEV ONLY: calls any resolver by name, like the old static/ui/dev.js. Reached at /dev.
// Remove before submission, together with the devGraphQuery resolver (SETUP-KESHAV.md section 8).
import Button from '@atlaskit/button/new';
import { token } from '@atlaskit/tokens';
import { useState } from 'react';
import { usePlatform } from '../platform';

export const DevPage = () => {
  const { invokeRaw } = usePlatform();
  const [name, setName] = useState('listHandovers');
  const [payload, setPayload] = useState('{}');
  const [out, setOut] = useState('');

  const run = async () => {
    try {
      setOut(JSON.stringify(await invokeRaw(name, JSON.parse(payload || '{}')), null, 2));
    } catch (e) {
      setOut(String(e));
    }
  };

  const field = { height: 32, padding: '0 8px', border: `1px solid ${token('color.border.input', '#8590A2')}`, borderRadius: 3, background: 'transparent', color: 'inherit', font: 'inherit' };
  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0, font: token('font.heading.medium', '600 20px/24px sans-serif') }}>Resolver test (dev only)</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Resolver<input value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, width: 220 }} /></label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 280 }}>Payload (JSON)<input value={payload} onChange={(e) => setPayload(e.target.value)} style={field} /></label>
        <div style={{ alignSelf: 'flex-end' }}><Button appearance="primary" onClick={() => void run()}>Run</Button></div>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', background: token('elevation.surface.sunken', '#F7F8F9'), padding: 12, borderRadius: 4, margin: 0 }}>{out}</pre>
    </main>
  );
};
