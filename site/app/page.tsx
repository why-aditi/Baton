import { exampleRows, facts, rules, steps, tools } from './content';

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <nav className="wrap" aria-label="Main">
          <a className="brand" href="#top">
            baton
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#score">Scoring</a>
            <a href="#mcp">MCP</a>
            <a className="btn btn-primary" href="#install">
              Install in Jira
            </a>
          </div>
        </nav>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="wrap split">
            <div className="stack">
              <h1>Find the code only one engineer understands, before they leave</h1>
              <p className="lead">
                Baton reads a departing engineer’s open pull requests, Jira issues and Confluence pages, scores each one for knowledge
                risk, and routes it to the teammate best placed to take it.
              </p>
              <div className="actions">
                <a className="btn btn-primary" href="#install">
                  Install in Jira
                </a>
                <a className="btn btn-ghost" href="#mcp">
                  Connect Claude Desktop
                </a>
              </div>
            </div>
            <figure className="panel" style={{ margin: 0 }}>
              <div className="panel-head">
                <span>Meera Iyer · leaving Dec 20</span>
                <span>6 high</span>
              </div>
              <ol className="rows" aria-label="Example inventory, highest risk first">
                {exampleRows.map((r) => (
                  <li key={r.title}>
                    <span className={r.score >= 60 ? 'score high' : 'score'} aria-label={`Risk ${r.score}`}>
                      {r.score}
                    </span>
                    <span className="title">
                      <span>{r.title}</span>
                      <span className="why">{r.why}</span>
                    </span>
                    <span className="to">→ {r.to}</span>
                  </li>
                ))}
              </ol>
              <figcaption className="note" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
                Example from the Northwind Pay demo
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="how">
          <div className="wrap stack" style={{ gap: 40 }}>
            <h2>A handover in three steps, run by their manager</h2>
            <ol className="steps">
              {steps.map((s) => (
                <li key={s.title}>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="score">
          <div className="wrap split top">
            <div className="stack">
              <h2>A score you can read line by line</h2>
              <p className="muted">
                No black box. Every point comes from a rule, and every rule shows up as a reason on the item. Owner suggestions work the
                same way: who worked on it, who’s on the same team and project, minus how much they already carry.
              </p>
            </div>
            <div className="panel">
              <ul className="rules" aria-label="Risk signals and their points">
                {rules.map((r) => (
                  <li key={r.signal}>
                    <span>{r.signal}</span>
                    <span>+{r.points}</span>
                  </li>
                ))}
                <li className="band">
                  <span>High from 60, medium from 30, capped at 100</span>
                  <span>0–100</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="mcp">
          <div className="wrap split top">
            <div className="stack">
              <h2>Five tools for Rovo and any MCP client</h2>
              <p className="muted">
                Your admin turns on MCP for Baton once. Then Rovo chat and Claude Desktop can list handovers, open one, find who owns an
                item now, list what’s at risk and start a new handover. Each call runs as the person asking, so it only sees what they can.
              </p>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              <pre aria-label="Baton’s tools and their inputs">
                {tools.map(([name, args]) => (
                  <span key={name}>
                    <span className="k">{name.padEnd(20)}</span>
                    {args}
                    {'\n'}
                  </span>
                ))}
              </pre>
              <div className="panel chat" role="group" aria-label="Example conversation in Claude Desktop">
                <span className="note">Claude Desktop</span>
                <span className="q">Who owns PAY-1 now?</span>
                <span className="a">Arjun Rao. Priya Nair reassigned it to him in Meera Iyer’s handover.</span>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="How Baton handles your data">
          <div className="wrap facts">
            {facts.map((f) => (
              <div key={f.title}>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="install">
          <div className="wrap split top">
            <div className="stack">
              <h2>Run your next handover in Jira</h2>
              <p className="muted">Baton is a Forge app. It installs once and works across Jira, Confluence, Rovo and MCP.</p>
            </div>
            <div className="stack install">
              <ol>
                <li>Install Baton in Jira. Installing needs an org admin, because Baton reads Teamwork Graph.</li>
                <li>Connect Confluence to the same installation, so Baton can publish handover pages.</li>
                <li>
                  Optional: in admin.atlassian.com, open Baton under <b>Connected apps</b> and turn on <b>Expose tools to MCP-compatible apps</b>.
                </li>
              </ol>
              {/* The install link goes here once the app is listed (Codegeist submission). */}
              <p className="note">The install link is published with the Codegeist submission.</p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>Baton · built on Atlassian Forge</span>
          <span>Jira · Confluence · Rovo · MCP</span>
        </div>
      </footer>
    </>
  );
}
