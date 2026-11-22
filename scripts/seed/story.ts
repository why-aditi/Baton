// Northwind Pay: the fictional fintech team the demo runs on (spec: "Seed data and demo
// environment"). Meera Iyer, a senior engineer, is leaving. She quietly owns the payment-retry
// service: its runbook, two open PRs and a pile of in-flight Jira work exist only in her head.
//
// Everything here is data. Seed IDs are stable, so the scripts can find what they made before
// (issues carry a `seed-<id>` label, pages and PRs are found by title and branch).

export type UserKey = 'meera' | 'arjun' | 'lin' | 'priya' | 'sam' | 'dana' | 'omar';

export const USERS: Record<UserKey, { name: string; role: string; teams: ('Payments' | 'Platform')[] }> = {
  meera: { name: 'Meera Iyer', role: 'Senior engineer, owns payment retries (leaving)', teams: ['Payments', 'Platform'] },
  arjun: { name: 'Arjun Rao', role: 'Engineer, settlements', teams: ['Payments'] },
  lin: { name: 'Lin Chen', role: 'Engineer, ledger', teams: ['Payments'] },
  priya: { name: 'Priya Nair', role: 'Engineering manager (runs the handover)', teams: ['Payments', 'Platform'] },
  sam: { name: 'Sam Okafor', role: 'Platform engineer', teams: ['Platform'] },
  dana: { name: 'Dana Weiss', role: 'Site reliability engineer', teams: ['Platform'] },
  omar: { name: 'Omar Haddad', role: 'Product manager, payments', teams: ['Payments'] },
};

export const PROJECTS = { PAY: 'Payments', PLAT: 'Platform' } as const;
export type ProjectKey = keyof typeof PROJECTS;

export type SeedIssue = {
  id: string;
  project: ProjectKey;
  summary: string;
  /** Creates the issue, so is its real reporter. */
  reporter: UserKey;
  assignee?: UserKey;
  status: 'todo' | 'in_progress' | 'done';
  /** Due date, in days after Meera's last day (negative is before). */
  due?: number;
  comments: { by: UserKey; text: string }[];
};

type Row = [id: string, project: ProjectKey, summary: string, reporter: UserKey, assignee: UserKey | null, status: SeedIssue['status'], due: number | null, comments?: [UserKey, string][]];

const ROWS: Row[] = [
  // ---- Meera's 14 open issues ----
  ['pay-retry-backoff', 'PAY', 'Payment retry: exponential backoff for card declines', 'meera', 'meera', 'in_progress', 3],
  ['pay-retry-redis-failover', 'PAY', 'Retry worker drops jobs during Redis failover', 'dana', 'meera', 'in_progress', -2, [
    ['dana', 'Saw this again during the Tuesday failover drill.'],
    ['meera', 'Reproduced locally. The worker acks before the job is persisted; fix in progress.'],
  ]],
  ['pay-psp-key-rotation', 'PAY', "Rotate the retry service's PSP API keys before year end", 'meera', 'meera', 'todo', 5],
  ['pay-dlq-replay', 'PAY', 'Dead-letter queue replay tool for failed retries', 'meera', 'meera', 'in_progress', null],
  ['pay-retry-decision-table', 'PAY', 'Document which decline codes we retry, for support', 'omar', 'meera', 'todo', 10, [
    ['omar', 'Support keeps asking which declines we retry and which we give up on.'],
  ]],
  ['pay-retry-metrics-split', 'PAY', 'Retry dashboard: split soft and hard declines', 'meera', 'meera', 'todo', null],
  ['pay-capture-idempotency', 'PAY', 'Idempotency keys for retried captures', 'arjun', 'meera', 'in_progress', 6, [
    ['arjun', 'This blocks the settlement batch work, so it is my top dependency.'],
  ]],
  ['pay-card-sdk-v5', 'PAY', 'Upgrade the card network SDK to v5', 'meera', 'meera', 'todo', 20],
  ['pay-flaky-clock-skew', 'PAY', 'Flaky test: RetrySchedulerTest handles clock skew', 'lin', 'meera', 'todo', null, [
    ['lin', 'Fails about 1 in 20 CI runs. Only on the arm64 runners as far as I can tell.'],
  ]],
  ['pay-backfill-october', 'PAY', 'Backfill missing retry attempts for October', 'meera', 'meera', 'todo', null],
  ['plat-retry-cron-scheduler', 'PLAT', 'Retry service: move cron jobs to the platform scheduler', 'sam', 'meera', 'in_progress', 4, [
    ['sam', 'The scheduler supports per-job concurrency limits now, so this should be safe.'],
  ]],
  ['plat-alert-runbook-links', 'PLAT', 'Retry alerts link to the old wiki runbook', 'dana', 'meera', 'todo', null],
  ['plat-retry-memory-limits', 'PLAT', 'Tune memory limits for the retry service', 'meera', 'meera', 'in_progress', null],
  ['pay-partner-bank-window', 'PAY', 'Partner bank retry window changes from January 15', 'omar', 'meera', 'todo', 7, [
    ['omar', 'Partner bank confirmed the new window by email; only Meera has the details.'],
  ]],

  // ---- Payments: everyone else ----
  ['pay-settlement-batch', 'PAY', 'Settlement batch: run per merchant timezone', 'arjun', 'arjun', 'in_progress', 12, [['meera', 'Retries must not cross the batch cutoff; happy to pair on it.']]],
  ['pay-settlement-report', 'PAY', 'Daily settlement report misses refunds', 'omar', 'arjun', 'todo', 15],
  ['pay-refund-webhooks', 'PAY', 'Refund webhooks fire twice on partial refunds', 'lin', 'arjun', 'in_progress', null, [['arjun', 'Looks like the outbox relay retries without a dedupe key.']]],
  ['pay-chargeback-api', 'PAY', 'Chargeback API: add evidence upload', 'omar', 'arjun', 'todo', 25],
  ['pay-currency-rounding', 'PAY', 'Currency rounding differs between ledger and invoices', 'lin', 'lin', 'in_progress', null, [['priya', 'Finance flagged this in the November close.']]],
  ['pay-ledger-reconcile', 'PAY', 'Ledger reconciliation job times out on month end', 'lin', 'lin', 'todo', 9],
  ['pay-ledger-archival', 'PAY', 'Archive ledger entries older than 7 years', 'priya', 'lin', 'todo', 40],
  ['pay-ledger-audit-trail', 'PAY', 'Audit trail for manual ledger adjustments', 'omar', 'lin', 'in_progress', 18],
  ['pay-3ds-fallback', 'PAY', '3-D Secure fallback for issuers without v2', 'omar', 'arjun', 'todo', 30],
  ['pay-apple-pay-tokens', 'PAY', 'Refresh expired Apple Pay merchant tokens', 'arjun', 'arjun', 'done', null],
  ['pay-psp-timeouts', 'PAY', 'Raise PSP client timeouts to match their SLA', 'meera', 'arjun', 'done', null, [['arjun', 'Done, and added a metric for slow PSP calls.']]],
  ['pay-invoice-pdf', 'PAY', 'Invoice PDFs render the wrong VAT label', 'omar', 'lin', 'done', null],
  ['pay-fraud-rules-sync', 'PAY', 'Fraud rules sync fails silently on schema change', 'priya', 'arjun', 'todo', null, [['meera', 'The retry service reads these rules too, so a silent failure means bad retries.']]],
  ['pay-merchant-onboarding', 'PAY', 'Merchant onboarding: validate IBAN before activation', 'omar', 'lin', 'todo', 21],
  ['pay-payout-holidays', 'PAY', 'Payouts: skip bank holidays in the schedule', 'omar', 'arjun', 'in_progress', 14],
  ['pay-api-rate-limits', 'PAY', 'Public API rate limits per merchant', 'priya', null, 'todo', null],
  ['pay-sca-exemptions', 'PAY', 'Apply SCA exemptions for low-value payments', 'omar', null, 'todo', 35],
  ['pay-error-codes-doc', 'PAY', 'Publish API error codes in the developer docs', 'omar', 'lin', 'done', null],
  ['pay-ledger-index', 'PAY', 'Add an index for ledger lookups by merchant', 'lin', 'lin', 'done', null],
  ['pay-retry-alert-noise', 'PAY', 'Retry alerts are too noisy at night', 'dana', 'arjun', 'todo', null, [['meera', 'Thresholds live in the retry config repo; I can explain them.']]],
  ['pay-sandbox-cards', 'PAY', 'Sandbox: add test cards for soft declines', 'arjun', 'arjun', 'todo', null],
  ['pay-dispute-sla', 'PAY', 'Track dispute response SLA per card network', 'omar', null, 'todo', 28],
  ['pay-kyc-reverify', 'PAY', 'Re-verify KYC for dormant merchants', 'priya', 'lin', 'todo', 45],

  // ---- Platform ----
  ['plat-k8s-upgrade', 'PLAT', 'Upgrade production cluster to Kubernetes 1.31', 'sam', 'sam', 'in_progress', 10, [['dana', 'Staging upgraded cleanly last week.']]],
  ['plat-base-image', 'PLAT', 'Bump the base image to fix the OpenSSL advisory', 'dana', 'sam', 'in_progress', 2],
  ['plat-secrets-manager', 'PLAT', 'Move service secrets to the secrets manager', 'priya', 'sam', 'todo', 20, [['meera', 'The retry service still reads PSP keys from env vars; needs migrating too.']]],
  ['plat-oncall-rota', 'PLAT', 'Automate the on-call rota handoff', 'dana', 'dana', 'todo', null],
  ['plat-log-retention', 'PLAT', 'Reduce log retention costs', 'priya', 'dana', 'in_progress', 16],
  ['plat-pagerduty-routing', 'PLAT', 'Route payment alerts to the Payments rotation', 'dana', 'dana', 'todo', null, [['meera', 'Retry alerts still page Platform first.']]],
  ['plat-db-failover-drill', 'PLAT', 'Quarterly database failover drill', 'dana', 'dana', 'done', null],
  ['plat-ci-cache', 'PLAT', 'CI cache misses on dependency changes', 'sam', 'sam', 'done', null],
  ['plat-terraform-drift', 'PLAT', 'Fix Terraform drift in the network module', 'sam', 'sam', 'todo', null],
  ['plat-cost-dashboard', 'PLAT', 'Per-team cloud cost dashboard', 'priya', 'dana', 'todo', 30],
  ['plat-redis-upgrade', 'PLAT', 'Upgrade Redis to 7.2 for the retry queues', 'dana', 'sam', 'todo', 12, [['meera', 'Coordinate with the retry worker fix before this goes out.']]],
  ['plat-sbom', 'PLAT', 'Generate SBOMs for all production images', 'sam', 'sam', 'todo', 40],
  ['plat-staging-reset', 'PLAT', 'Nightly staging data reset', 'sam', null, 'todo', null],
  ['plat-ingress-tls', 'PLAT', 'Renew the ingress wildcard certificate', 'dana', 'dana', 'done', null],
  ['plat-autoscaling', 'PLAT', 'Autoscale workers on queue depth', 'sam', 'sam', 'in_progress', null, [['dana', 'The retry queue would benefit most from this.']]],
  ['plat-backup-restore-test', 'PLAT', 'Test restoring the ledger database from backup', 'dana', 'dana', 'todo', 8],
  ['plat-feature-flags', 'PLAT', 'Clean up stale feature flags', 'priya', 'sam', 'todo', null],
  ['plat-dns-migration', 'PLAT', 'Migrate internal DNS zones', 'sam', null, 'todo', 50],
  ['plat-vuln-scan', 'PLAT', 'Weekly container vulnerability scan report', 'dana', 'dana', 'done', null],
  ['plat-runbook-template', 'PLAT', 'Standard runbook template for all services', 'priya', 'dana', 'todo', null],
  ['plat-deploy-freeze', 'PLAT', 'Set up the December deploy freeze', 'priya', 'sam', 'todo', -5],
  ['plat-grafana-sso', 'PLAT', 'Grafana SSO through Atlassian Access', 'sam', 'sam', 'done', null],
];

export const ISSUES: SeedIssue[] = ROWS.map(([id, project, summary, reporter, assignee, status, due, comments = []]) => ({
  id,
  project,
  summary,
  reporter,
  ...(assignee && { assignee }),
  status,
  ...(due !== null && { due }),
  comments: comments.map(([by, text]) => ({ by, text })),
}));

/** Label every seeded issue carries; `seed-<id>` finds one issue. */
export const SEED_LABEL = 'baton-seed';
export const issueLabel = (id: string) => `seed-${id}`;

// ---- Confluence ----

export type SeedPage = {
  id: string;
  title: string;
  /** Creates the page, so is its owner and author. */
  author: UserKey;
  /** Each edits the page once after it's created, which makes them contributors. */
  editors: UserKey[];
  /** Seed page IDs this page links to. */
  links: string[];
  body: string;
};

export const PAGES: SeedPage[] = [
  // Meera's four: nobody else has touched them.
  { id: 'runbook', title: 'Payment retry service runbook', author: 'meera', editors: [], links: ['decline-codes'],
    body: 'How the retry service works, how to pause it, and what to do when the retry queue backs up. Staging credentials for the PSP sandbox live in the team vault under "retry-psp".' },
  { id: 'retry-oncall', title: 'Retry queue on-call notes', author: 'meera', editors: [], links: ['runbook'],
    body: 'Things that page at night and what they usually mean. The dead-letter queue fills up when the PSP returns 503s for more than five minutes.' },
  { id: 'decline-codes', title: 'Card decline codes we retry', author: 'meera', editors: [], links: [],
    body: 'Soft declines (51, 61, 65, 91) are retried with backoff. Hard declines (04, 07, 41, 43) never are. The partner bank window changes in January.' },
  { id: 'backoff-design', title: 'Retry backoff design notes', author: 'meera', editors: [], links: ['decline-codes'],
    body: 'Why exponential backoff with jitter, the caps per card network, and the experiment that set them.' },

  // Everyone else's, several linking to the runbook.
  { id: 'payments-home', title: 'Payments team home', author: 'priya', editors: ['omar'], links: ['runbook', 'settlement-guide', 'roadmap'],
    body: 'Who we are, what we own, and where to find things.' },
  { id: 'postmortem-retry-storm', title: 'Postmortem: October retry storm', author: 'dana', editors: ['meera', 'priya'], links: ['runbook', 'retry-oncall'],
    body: 'A PSP outage caused a retry storm that delayed settlements by four hours. Action items include queue depth alerts and a retry circuit breaker.' },
  { id: 'platform-oncall', title: 'Platform on-call rota and escalation', author: 'sam', editors: ['dana'], links: ['runbook'],
    body: 'Who is on call, how to escalate, and the runbooks for each service.' },
  { id: 'roadmap', title: 'Q1 payments roadmap', author: 'omar', editors: ['priya'], links: [],
    body: 'Chargebacks, SCA exemptions and payouts across bank holidays.' },
  { id: 'settlement-guide', title: 'Settlement reconciliation guide', author: 'arjun', editors: ['lin'], links: [],
    body: 'How daily settlement batches reconcile against the ledger, and what to do when they do not.' },
  { id: 'ledger-overview', title: 'Ledger service overview', author: 'lin', editors: ['arjun'], links: ['settlement-guide'],
    body: 'Double-entry ledger design, the accounts we keep, and how adjustments are audited.' },
  { id: 'deploy-checklist', title: 'Production deploy checklist', author: 'sam', editors: ['dana'], links: ['platform-oncall'],
    body: 'Before, during and after a production deploy.' },
  { id: 'fraud-faq', title: 'Fraud rules FAQ', author: 'omar', editors: ['arjun'], links: [],
    body: 'How fraud rules are written, reviewed and synced to the payment services.' },
];

// ---- Bitbucket ----

export type SeedPullRequest = {
  branch: string;
  title: string;
  author: UserKey;
  /** Reviewers other than the author. Meera's two have none: nobody else reviews her code. */
  reviewers: UserKey[];
  /** Seed issue whose Jira key goes in the title, so Jira links the PR to it. */
  issue?: string;
  file: { path: string; content: string };
};

export const REPO = { slug: 'payments-service', name: 'payments-service' };

export const PULL_REQUESTS: SeedPullRequest[] = [
  { branch: 'meera/retry-jitter', title: 'Add jittered backoff to the retry worker', author: 'meera', reviewers: [], issue: 'pay-retry-backoff',
    file: { path: 'retry/backoff.md', content: 'Exponential backoff with full jitter, capped per card network.\n' } },
  { branch: 'meera/retry-thresholds-config', title: 'Move retry thresholds to config', author: 'meera', reviewers: [], issue: 'pay-retry-decision-table',
    file: { path: 'retry/thresholds.md', content: 'Soft decline thresholds move from code to config.\n' } },
  { branch: 'arjun/capture-idempotency', title: 'Idempotency keys for settlement captures', author: 'arjun', reviewers: ['meera'], issue: 'pay-capture-idempotency',
    file: { path: 'settlement/idempotency.md', content: 'Captures carry an idempotency key derived from the order ID.\n' } },
  { branch: 'lin/ledger-reconcile-report', title: 'Ledger reconciliation report', author: 'lin', reviewers: ['arjun'], issue: 'pay-ledger-reconcile',
    file: { path: 'ledger/reconcile.md', content: 'Month-end reconciliation runs in chunks of 10,000 entries.\n' } },
  { branch: 'sam/base-image-openssl', title: 'Bump base image for the OpenSSL advisory', author: 'sam', reviewers: ['dana'], issue: 'plat-base-image',
    file: { path: 'platform/base-image.md', content: 'Base image moves to the patched OpenSSL build.\n' } },
  { branch: 'dana/retry-queue-alert', title: 'Alert on retry queue depth', author: 'dana', reviewers: ['sam', 'lin'], issue: 'plat-pagerduty-routing',
    file: { path: 'platform/alerts.md', content: 'Page Payments when the retry queue is deeper than 5,000 for 10 minutes.\n' } },
];

// ---- Dates ----

/** Meera's last day plus `days`, as YYYY-MM-DD. */
export const dueDate = (lastDay: string, days: number) => {
  const d = new Date(`${lastDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
