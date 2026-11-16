// Shapes shared by the frontend (graph normalizers) and the backend (scoring, storage, LLM).

export type ItemKind = 'jira_issue' | 'pull_request' | 'confluence_page' | 'goal' | 'project';

export type SubjectRole = 'assignee' | 'reporter' | 'author' | 'reviewer' | 'owner' | 'contributor';

/** One piece of the departing person's work, normalized from a Teamwork Graph result. */
export type Item = {
  ari: string;
  kind: ItemKind;
  title: string;
  url: string;
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
};

export type Band = 'high' | 'medium' | 'low';

export type OwnerSuggestion = { accountId: string; score: number; reason: string };

export type ScoredItem = Item & {
  risk: number;
  band: Band;
  reasons: string[];
  suggestions: OwnerSuggestion[];
  acceptedOwnerAccountId?: string;
};
