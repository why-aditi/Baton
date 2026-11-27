import { token } from '@atlaskit/tokens';
import { DevPage } from './screens/DevPage';
import { HandoverList } from './screens/HandoverList';
import { HandoverScreen } from './screens/HandoverScreen';
import { IssuePanel } from './screens/IssuePanel';
import { AutomationConfig } from './screens/AutomationConfig';
import { NewHandover } from './screens/NewHandover';
import { PlatformProvider, type Platform } from './platform';
import type { Route } from './route';

export const App = ({ platform, route }: { platform: Platform; route: Route }) => (
  <PlatformProvider value={platform}>
    <div
      style={{
        // The issue panel sizes to its content; the app page fills the window.
        minHeight: route.name === 'issue' || route.name === 'automation-config' ? undefined : '100vh',
        background: token('elevation.surface', '#FFFFFF'),
        color: token('color.text', '#172B4D'),
        font: token('font.body', 'normal 400 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'),
      }}
    >
      {route.name === 'automation-config' ? (
        <AutomationConfig extension={route.extension} showDebug={route.showDebug} />
      ) : route.name === 'issue' ? (
        <IssuePanel issueId={route.issueId} issueKey={route.issueKey} />
      ) : route.name === 'handover' ? (
        <HandoverScreen key={route.id} id={route.id} build={!!route.build} />
      ) : route.name === 'new' ? (
        <NewHandover />
      ) : route.name === 'dev' ? (
        <DevPage />
      ) : (
        <HandoverList />
      )}
    </div>
  </PlatformProvider>
);
