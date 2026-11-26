import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy · Baton' };

// Keep in step with the app: storage in app/src/forge/kvsStore.ts, LLM egress in app/manifest.yml.
export default function Privacy() {
  return (
    <main id="main" className="wrap" style={{ maxWidth: 760, padding: '64px 16px' }}>
      <p>
        <a href="../">← Baton</a>
      </p>
      <h1>Privacy</h1>
      <p className="muted">Last updated 26 November 2026</p>

      <h2>What Baton stores</h2>
      <p>
        For each handover: the departing person&apos;s name and Atlassian account ID, the reason and last day, the
        Jira issues, pull requests and Confluence pages found for them (titles, keys, links and status), risk scores,
        suggested and chosen owners (names and account IDs), the handover questions and the answers people type.
      </p>
      <p>
        This is kept in Atlassian Forge storage for the site where Baton is installed, on Atlassian&apos;s
        infrastructure. Baton runs no servers or databases of its own.
      </p>

      <h2>Who can see it</h2>
      <p>
        The person who started a handover, people they share it with, and Jira admins. The departing person sees only
        their own questions. A handover you publish becomes a Confluence page with that space&apos;s permissions.
      </p>

      <h2>AI features</h2>
      <p>
        To draft questions, one-line summaries and the handover summary, Baton sends item titles, risk reasons and
        answers to an LLM API (Groq, with Mistral as a fallback). Before sending, it replaces people&apos;s names
        with placeholders such as P1 and refers to items by short references instead of Atlassian IDs, then puts the
        names back in Baton. Nothing else leaves Atlassian.
      </p>

      <h2>Deleting data</h2>
      <p>
        The person who started a handover, or a Jira admin, can delete it. Uninstalling Baton deletes its Forge
        storage for that site. Published Confluence pages stay until you delete them in Confluence.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href="https://github.com/why-aditi/Baton/issues">github.com/why-aditi/Baton/issues</a>.
      </p>
    </main>
  );
}
