import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy · Baton' };

// Keep in step with the app: storage in app/src/forge/kvsStore.ts and the Handover type (app/src/types.ts),
// the LLM (Forge LLMs, app/src/llm/forgeLlm.ts), what it is sent (app/src/llm/tasks.ts) and what is
// replaced first (app/src/llm/pseudonymize.ts),
// MCP replies in app/src/actions/index.ts.
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
        Jira issues, pull requests, Confluence pages, goals and projects found for them (titles, keys, links and
        status), risk scores and their reasons, suggested and chosen owners, the handover questions, the answers people
        type, and the generated summary.
      </p>
      <p>
        It also keeps the names and account IDs of the other people found around that work: collaborators, reviewers,
        commenters and teammates. Baton uses them to suggest new owners and to show names instead of IDs.
      </p>
      <p>
        All of this is kept in Atlassian Forge storage for the site where Baton is installed, on Atlassian&apos;s
        infrastructure. Baton runs no servers or databases of its own.
      </p>

      <h2>Who can see it</h2>
      <p>
        The person who started a handover, people they share it with, and Jira admins. The departing person sees only
        their own questions. Everyone else sees nothing, not even that the handover exists. In Rovo and through
        MCP, only people who can edit a handover see it. A handover you publish becomes a Confluence page with that space&apos;s permissions.
      </p>

      <h2>What leaves Atlassian</h2>
      <p>
        <strong>AI features stay on Atlassian.</strong> To draft questions, one-line item summaries and the handover
        summary, Baton uses Forge LLMs, which Atlassian hosts. It sends them item titles, keys and statuses, risk
        reasons, the reason and last day, and the questions and answers. Even so, it first replaces the names, account
        IDs and email addresses of the people it knows about with placeholders such as P1, refers to items by short
        references instead of Atlassian IDs, and puts the names back afterwards. A name it doesn&apos;t know, typed into
        an issue title or an answer, is sent as written.
      </p>
      <p>
        <strong>Through MCP.</strong> If you connect an external AI client such as Claude Desktop to Baton, Baton
        answers that client&apos;s questions with handover details you can see: names and profile links, items,
        owners, and short excerpts of answers. That data then goes to the client and AI provider you chose.
      </p>
      <p>Nothing else leaves Atlassian.</p>

      <h2>Deleting data</h2>
      <p>
        The person who started a handover, or a Jira admin, can delete it. Published Confluence pages stay until you
        delete them in Confluence. Data in Forge storage after Baton is uninstalled is handled under Atlassian&apos;s
        Forge data retention rules.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href="https://github.com/why-aditi/Baton/issues">github.com/why-aditi/Baton/issues</a>.
      </p>
    </main>
  );
}
