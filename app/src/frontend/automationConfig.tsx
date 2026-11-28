// Jira Automation's settings form for the "Start handover" step, in UI Kit (render: native).
// Automation never got a handshake from the Custom UI frame (its iFrameResizer gave up after 5 s), so this
// form follows the documented UI Kit pattern: read saved values from the context, view.submit on change.
import { view } from '@forge/bridge';
import ForgeReconciler, { Form, Label, Stack, Text, Textfield, useProductContext } from '@forge/react';
import React, { useRef, useState } from 'react';
import { initialValues, toSubmit, type AutomationValues } from '../../ui/src/automationConfig';

const FIELDS: { name: keyof AutomationValues; label: string; help: string }[] = [
  { name: 'person', label: 'Person leaving', help: 'A name, an account ID or a smart value, e.g. {{issue.assignee.accountId}}' },
  { name: 'reason', label: 'Reason', help: 'leaving, leave or team_change' },
  { name: 'lastDay', label: 'Last day', help: 'YYYY-MM-DD or a smart value, e.g. {{issue.duedate}}' },
  { name: 'recipient', label: 'Share with (optional)', help: 'Usually their manager, e.g. {{issue.reporter.accountId}}' },
];

const ConfigForm = ({ extension }: { extension: unknown }) => {
  // Saved values: the docs show extension.data.inputs; initialValues also tries config, inputs, actionConfig.
  const data = (extension as { data?: unknown } | undefined)?.data;
  // Uncontrolled fields: in UI Kit each keystroke round-trips to this app, so a controlled `value`
  // re-rendered stale text over fast typing (live, Nov 28: "{{issue.duedate}}" ended up as "}").
  const [initial] = useState<AutomationValues>(() => initialValues(data ?? extension));
  const values = useRef(initial);

  const change = (name: keyof AutomationValues, value: string) => {
    values.current = { ...values.current, [name]: value } as AutomationValues;
    void view.submit(toSubmit(values.current));
  };

  return (
    <Form onSubmit={() => void view.submit(toSubmit(values.current))}>
      <Stack space="space.200">
        {FIELDS.map((f) => (
          <Stack key={f.name} space="space.050">
            <Label labelFor={f.name}>{f.label}</Label>
            <Textfield id={f.name} name={f.name} defaultValue={initial[f.name]} onChange={(e) => change(f.name, e.target.value)} />
            <Text>{f.help}</Text>
          </Stack>
        ))}
      </Stack>
    </Form>
  );
};

const App = () => {
  const context = useProductContext();
  return context ? <ConfigForm extension={context.extension} /> : null;
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
