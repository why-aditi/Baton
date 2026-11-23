import Button from '@atlaskit/button/new';
import SectionMessage, { SectionMessageAction } from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { token } from '@atlaskit/tokens';
import type { ReactNode } from 'react';
import { ApiError } from '../api';

export const Loading = ({ label }: { label: string }) => (
  <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 32, color: token('color.text.subtle', '#44546F') }}>
    <Spinner size="medium" label={label} />
    <span>{label}</span>
  </div>
);

/** What to tell the user for a failed call. not_found also means "no access", so both read the same. */
export const errorText = (e: unknown): string => {
  if (e instanceof ApiError) {
    if (e.code === 'not_found') return 'This handover doesn’t exist, or you don’t have access to it.';
    return e.message;
  }
  return 'Something went wrong. Try again.';
};

export const ErrorBanner = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <SectionMessage
    appearance="error"
    title="That didn’t work"
    actions={onRetry ? [<SectionMessageAction key="retry" onClick={onRetry}>Try again</SectionMessageAction>] : undefined}
  >
    <p>{errorText(error)}</p>
  </SectionMessage>
);

export const EmptyState = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <div style={{ maxWidth: 480, margin: '64px auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
    <h2 style={{ margin: 0, font: token('font.heading.medium', '600 20px/24px sans-serif') }}>{title}</h2>
    <div style={{ color: token('color.text.subtle', '#44546F') }}>{children}</div>
    {action}
  </div>
);

export { Button };
