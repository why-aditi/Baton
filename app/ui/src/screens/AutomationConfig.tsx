// Jira Automation's settings form for "Start handover" (the start-handover action's config UI).
// Fields take plain values or smart values such as {{issue.assignee.accountId}}.
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import { useState, type ReactNode } from 'react';
import { initialValues, toSubmit, validate, type AutomationErrors, type AutomationValues } from '../automationConfig';
import { REASONS } from '../newHandover';
import { usePlatform } from '../platform';

const subtle = token('color.text.subtle', '#44546F');
const small = token('font.body.small', 'normal 400 12px/16px sans-serif');
const input = {
  height: 32,
  padding: '0 8px',
  border: `1px solid ${token('color.border.input', '#8590A2')}`,
  borderRadius: 3,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
};

const Field = ({ id, label, error, help, children }: { id: string; label: string; error?: string; help: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label htmlFor={id} style={{ fontWeight: 600 }}>
      {label}
    </label>
    {children}
    <span role={error ? 'alert' : undefined} style={{ color: error ? token('color.text.danger', '#AE2E24') : subtle, font: small }}>
      {error ?? help}
    </span>
  </div>
);

export const AutomationConfig = ({ extension, showDebug }: { extension: unknown; showDebug: boolean }) => {
  const { submitConfig } = usePlatform();
  const [v, setV] = useState<AutomationValues>(() => initialValues(extension));
  const [errors, setErrors] = useState<AutomationErrors>({});
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const set = <K extends keyof AutomationValues>(k: K, value: AutomationValues[K]) => setV((p) => ({ ...p, [k]: value }));

  const save = async () => {
    const e = validate(v);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setState('saving');
    try {
      await submitConfig?.(toSubmit(v));
      setState('idle');
    } catch (err) {
      console.error('Automation config submit failed', err);
      setState('failed');
    }
  };

  return (
    <form
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p style={{ margin: 0, color: subtle }}>
        Starts a draft Baton handover. If the person already has one in progress, Baton keeps that one instead of starting another.
      </p>
      <Field id="person" label="Person leaving" error={errors.person} help="A name, an account ID or a smart value, such as {{issue.assignee.accountId}}.">
        <input id="person" style={input} value={v.person} onChange={(e) => set('person', e.target.value)} />
      </Field>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <legend style={{ fontWeight: 600, padding: 0, marginBottom: 4 }}>Reason</legend>
        {REASONS.map((r) => (
          <label key={r.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="radio" name="reason" value={r.value} checked={v.reason === r.value} onChange={() => set('reason', r.value)} />
            {r.label}
          </label>
        ))}
        {errors.reason && (
          <span role="alert" style={{ color: token('color.text.danger', '#AE2E24'), font: small }}>
            {errors.reason}
          </span>
        )}
      </fieldset>
      <Field id="lastDay" label="Last day" error={errors.lastDay} help="YYYY-MM-DD, or a smart value such as {{issue.duedate}}.">
        <input id="lastDay" style={input} value={v.lastDay} onChange={(e) => set('lastDay', e.target.value)} />
      </Field>
      <Field
        id="recipient"
        label="Share with (optional)"
        help="Usually their manager. Rules run as an automation account, so without this only Jira admins can see the handover."
      >
        <input id="recipient" style={input} value={v.recipient} onChange={(e) => set('recipient', e.target.value)} />
      </Field>
      {state === 'failed' && (
        <SectionMessage appearance="error" title="Not saved">
          <p>Automation didn’t accept the settings. Try again; if it keeps failing, the browser console has the details.</p>
        </SectionMessage>
      )}
      <div>
        <Button type="submit" appearance="primary" isDisabled={state === 'saving'}>
          {state === 'saving' ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {showDebug && (
        <details>
          <summary style={{ cursor: 'pointer', color: subtle }}>What Automation sent (development only)</summary>
          <pre style={{ whiteSpace: 'pre-wrap', font: small, background: token('elevation.surface.sunken', '#F7F8F9'), padding: 8 }}>
            {JSON.stringify(extension, null, 2)}
          </pre>
        </details>
      )}
    </form>
  );
};
