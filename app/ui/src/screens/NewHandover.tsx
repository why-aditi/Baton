// New handover: who, why, their last day and who else can see it. Creating it opens the handover
// and starts reading the graph straight away.
import Button from '@atlaskit/button/new';
import { DatePicker } from '@atlaskit/datetime-picker';
import { AsyncSelect } from '@atlaskit/select';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api';
import { errorText } from '../components/States';
import { REASONS, isoDay, toPayload, validate, type FieldErrors, type NewHandoverValues, type Person } from '../newHandover';
import { usePlatform } from '../platform';

const subtle = token('color.text.subtle', '#44546F');
const small = token('font.body.small', '400 12px/16px sans-serif');

type Option = { label: string; value: string };
const toOption = (p: Person): Option => ({ label: p.name, value: p.accountId });
const fromOption = (o: Option | null): Person | null => (o ? { accountId: o.value, name: o.label } : null);

export const NewHandover = ({ initial }: { initial?: Partial<NewHandoverValues> }) => {
  const { api, navigate, searchPeople, now } = usePlatform();
  const today = isoDay(now());
  const [v, setV] = useState<NewHandoverValues>({ person: null, reason: 'leaving', lastDay: '', recipient: null, ...initial });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof NewHandoverValues>(k: K, value: NewHandoverValues[K]) => {
    setV((prev) => ({ ...prev, [k]: value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  // react-select calls this on every keystroke; an empty query lists nobody.
  const loadPeople = (query: string): Promise<Option[]> => {
    if (query.trim().length < 2) return Promise.resolve([]);
    return searchPeople(query.trim())
      .then((people) => people.map(toOption))
      .catch(() => []);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(v, today);
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const h = await api.createHandover(toPayload(v));
      navigate({ name: 'handover', id: h.id, build: true });
    } catch (err) {
      // The backend refuses your own handover with bad_input; show that under the person field.
      if (err instanceof ApiError && err.code === 'bad_input' && /your handover/i.test(err.message)) {
        setErrors({ person: err.message });
      } else {
        setSubmitError(err);
      }
      setSaving(false);
    }
  };

  const reason = REASONS.find((r) => r.value === v.reason)!;

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <nav aria-label="Breadcrumb" style={{ color: subtle }}>
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              navigate({ name: 'list' });
            }}
          >
            Handovers
          </a>{' '}
          / New
        </nav>
        <h1 style={{ margin: 0, font: token('font.heading.large', '600 24px/28px sans-serif') }}>New handover</h1>
        <p style={{ margin: 0, color: subtle }}>
          Baton reads this person’s open work as you, so start it as someone who can see their projects, usually their manager.
        </p>
      </div>

      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field id="person" label="Person" error={errors.person}>
          <AsyncSelect<Option>
            inputId="person"
            aria-describedby={errors.person ? 'person-error' : undefined}
            placeholder="Search by name"
            cacheOptions
            loadOptions={loadPeople}
            noOptionsMessage={({ inputValue }) => (inputValue.trim().length < 2 ? 'Type at least 2 letters' : 'Nobody found')}
            value={v.person ? toOption(v.person) : null}
            onChange={(o) => set('person', fromOption(o))}
            isInvalid={!!errors.person}
          />
        </Field>

        <fieldset style={{ margin: 0, padding: 0, border: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>Reason</legend>
          {REASONS.map((r) => (
            <label key={r.value} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" name="reason" value={r.value} checked={v.reason === r.value} onChange={() => set('reason', r.value)} />
              {r.label}
            </label>
          ))}
        </fieldset>

        <Field id="lastDay" label={reason.lastDayLabel} error={errors.lastDay} help="Questions are due before this, and items due soon after it score higher.">
          <div style={{ maxWidth: 240 }}>
            <DatePicker
              id="lastDay"
              aria-describedby={errors.lastDay ? 'lastDay-error' : 'lastDay-help'}
              value={v.lastDay}
              minDate={today}
              locale="en-US"
              placeholder="Choose a date"
              onChange={(d: string) => set('lastDay', d)}
              isInvalid={!!errors.lastDay}
            />
          </div>
        </Field>

        <Field
          id="recipient"
          label="Share with (optional)"
          error={errors.recipient}
          help="They can see and edit this handover too, for example whoever takes over most of the work."
        >
          <AsyncSelect<Option>
            inputId="recipient"
            aria-describedby={errors.recipient ? 'recipient-error' : 'recipient-help'}
            placeholder="Search by name"
            cacheOptions
            isClearable
            loadOptions={loadPeople}
            noOptionsMessage={({ inputValue }) => (inputValue.trim().length < 2 ? 'Type at least 2 letters' : 'Nobody found')}
            value={v.recipient ? toOption(v.recipient) : null}
            onChange={(o) => set('recipient', fromOption(o))}
            isInvalid={!!errors.recipient}
          />
        </Field>

        {submitError ? (
          <SectionMessage appearance="error" title="The handover wasn’t created">
            <p>{errorText(submitError)}</p>
          </SectionMessage>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" appearance="primary" isDisabled={saving}>
            {saving ? 'Creating…' : 'Build inventory'}
          </Button>
          <Button onClick={() => navigate({ name: 'list' })} isDisabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
};

const Field = ({ id, label, error, help, children }: { id: string; label: string; error?: string; help?: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label htmlFor={id} style={{ fontWeight: 600 }}>
      {label}
    </label>
    {children}
    {error ? (
      <span id={`${id}-error`} role="alert" style={{ color: token('color.text.danger', '#AE2E24'), font: small }}>
        {error}
      </span>
    ) : help ? (
      <span id={`${id}-help`} style={{ color: subtle, font: small }}>
        {help}
      </span>
    ) : null}
  </div>
);
