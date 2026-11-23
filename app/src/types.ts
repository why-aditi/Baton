// Shapes shared by the frontend (graph normalizers) and the backend (scoring, storage, LLM).

export type ItemKind = 'jira_issue' | 'pull_request' | 'confluence_page' | 'goal' | 'project';

export type SubjectRole = 'assignee' | 'reporter' | 'author' | 'reviewer' | 'owner' | 'contributor';

/** One piece of the departing person's work, normalized from a Teamwork Graph result. */
export type Item = {
  ari: string;
  kind: ItemKind;
  title: string;
  url: string;
  /** Jira issue key, e.g. PAY-142. Lets agents look items up the way people name them. */
  key?: string;
  status?: string;
  /** Normalizers map Jira status categories and PR states onto this. An open PR is 'in_progress'. */
  statusCategory?: 'todo' | 'in_progress' | 'done';
  updatedAt?: string;
  /** Other user ARIs linked to the item. The subject may appear here; scoring ignores them. */
  collaborators: string[];
  subjectRole: SubjectRole;
  /** Jira project key, Bitbucket repo or Confluence space. Used for "same project" owner ranking. */
  container?: string;
  /** Pull requests only: reviewer user ARIs. */
  reviewers?: string[];
  /** Jira only, ISO dates. */
  dueDate?: string;
  sprintEndDate?: string;
  /** Confluence only: how many other pages link to this one. */
  inboundLinks?: number;
  /**
   * Pull requests only: other people on it Baton can't name (Bitbucket names come back null). They
   * count as "someone else has context" when scoring, but are never suggested as owners.
   */
  unnamedOthers?: number;
};

export type Band = 'high' | 'medium' | 'low';

export type OwnerSuggestion = { accountId: string; score: number; reason: string };

export type ScoredItem = Item & {
  risk: number;
  band: Band;
  reasons: string[];
  suggestions: OwnerSuggestion[];
  acceptedOwnerAccountId?: string;
  /** LLM one-liner, High and Medium items only. */
  oneLine?: string;
};

export type Reason = 'leaving' | 'leave' | 'team_change';
export type Status = 'draft' | 'collecting' | 'ready' | 'published';

export type Question = { id: string; text: string; itemAris: string[]; answer?: string };

export type SummarySection = { ownerAccountId: string | null; body: string; itemAris: string[] };
export type HandoverSummary = { overview: string; risks: string[]; sections: SummarySection[] };

export type Handover = {
  id: string;
  subjectAccountId: string;
  subjectAri: string;
  subjectName: string;
  initiatorAccountId: string;
  recipientAccountIds: string[];
  reason: Reason;
  lastDay: string;
  status: Status;
  items: ScoredItem[];
  /** Display names by account ID, from the graph. Used for owner names and pseudonymization. */
  people: Record<string, string>;
  questions: Question[];
  summary?: HandoverSummary;
  /** Hash of the scored inventory; the LLM cache key. */
  inputHash: string;
  /** inputHash each LLM output was generated from. Regenerated only when it differs. */
  generatedFrom: { questions?: string; oneLines?: string; summary?: string };
  confluencePageId?: string;
  confluencePageUrl?: string;
  createdAt: string;
  updatedAt: string;
};

/** Who is calling: from the resolver context, or the Rovo/MCP action caller. */
export type Caller = { accountId: string; isAdmin: boolean };
