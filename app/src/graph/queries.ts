// Teamwork Graph queries Baton runs, as the signed-in user, from the app page. Field selections
// match the recordings in test/fixtures/. Operation names must be company_operation. Never select
// edges.cursor: it comes back null and, being non-null, nulls the whole edge.

const PAGE_INFO = 'pageInfo { hasNextPage endCursor }';
const USER = '{ id name }';

const JIRA_ITEM = `... on JiraWorkItem { id key summary webUrl dueAt resolvedAt
  status { name statusCategory { key } } assignee ${USER} reporter ${USER} }`;

export const Q = {
  assignedJira: `query baton_assignedWork($userId: ID!, $after: String) {
    atlassianUserAssignedJiraWorkItems(userId: $userId, first: 25, after: $after) {
      edges { node { __typename ${JIRA_ITEM} } } ${PAGE_INFO} } }`,

  reportedJira: `query baton_reportedWork($userId: ID!, $after: String) {
    atlassianUserReportedJiraWorkItems(userId: $userId, first: 25, after: $after) {
      edges { node { __typename ${JIRA_ITEM} } } ${PAGE_INFO} } }`,

  // `since` is required. `roles` is unreliable: [CREATED] alone errors ("In evaluation not implemented
  // yet") and [CREATED, REVIEWED] started erroring too (Nov 22), so it's left off and normalize keeps
  // only PRs the subject wrote or reviews.
  pullRequests: `query baton_pullRequests($userId: ID!, $after: String) {
    atlassianUserPullRequests(userId: $userId, since: "P90D", first: 25, after: $after) {
      edges { node { __typename ... on ExternalPullRequest { id displayId title url status lastUpdatedAt repositoryId
        author ${USER} reviewers { approvalStatus user ${USER} } } } } ${PAGE_INFO} } }`,

  // Runs the persisted PQ_USER_OWNED_PAGES query; only the owning app can run it.
  ownedPages: `query baton_ownedPages($queryKey: String!, $queryParams: CypherRequestParams, $after: String) {
    customQuery(queryKey: $queryKey, queryParams: $queryParams, first: 25, after: $after) {
      edges { node { columns { key value { __typename ... on CypherQueryResultNode { id data { __typename
        ... on ConfluencePage { id title webUrl status lastUpdatedAt owner ${USER} author ${USER} lastEditor ${USER}
          space { key } } } } } } } } ${PAGE_INFO} } }`,

  // roles fails ("In evaluation not implemented yet"), so it's left off and normalize filters by owner.
  goalsAndProjects: `query baton_goalsAndProjects($userId: ID!, $after: String) {
    atlassianUserGoalsAndProjects(userId: $userId, first: 25, after: $after) {
      edges { node { __typename
        ... on AtlassianGoal { id key name url archived dueDateEndedAt updatedAt owner ${USER} }
        ... on AtlassianProject { id key name url archived state dueDateEndedAt lastUpdatedAt owner ${USER} } } }
      ${PAGE_INFO} } }`,

  // 403s when the app asks; works as the user, which is how the app page calls it.
  userTeams: `query baton_userTeams($userId: ID!, $after: String) {
    atlassianUserInTeams(userId: $userId, first: 25, after: $after) {
      edges { node { __typename ... on AtlassianTeam { id displayName } } } ${PAGE_INFO} } }`,

  // Runs the persisted PQ_PAGE_INBOUND_REFS query: pages that link to one page (for "widely referenced").
  pageInboundRefs: `query baton_pageInboundRefs($queryKey: String!, $queryParams: CypherRequestParams, $after: String) {
    customQuery(queryKey: $queryKey, queryParams: $queryParams, first: 25, after: $after) {
      edges { node { columns { key value { __typename ... on CypherQueryResultNode { id } } } } } ${PAGE_INFO} } }`,

  teamMembers: `query baton_teamMembers($teamAri: ID!, $after: String) {
    atlassianTeamMembers(teamAri: $teamAri, first: 25, after: $after) {
      edges { node { __typename ... on AtlassianUser { id name } } } ${PAGE_INFO} } }`,

  pageContributors: `query baton_pageContributors($id: ID!, $after: String) {
    confluencePageContributors(id: $id, first: 25, after: $after) {
      edges { node { __typename ... on AtlassianUser { id name } } } ${PAGE_INFO} } }`,

  workItemComments: `query baton_workItemComments($id: ID!, $after: String) {
    jiraWorkItemComments(id: $id, since: "P180D", first: 25, after: $after) {
      edges { node { __typename ... on JiraWorkItemComment { id deleted author ${USER} } } } ${PAGE_INFO} } }`,

  // One page is enough: owner ranking caps load at 20 open items.
  openAssigned: `query baton_openAssigned($userId: ID!, $after: String) {
    atlassianUserAssignedJiraWorkItems(userId: $userId, first: 25, after: $after) {
      edges { node { __typename ... on JiraWorkItem { id resolvedAt status { statusCategory { key } } } } }
      ${PAGE_INFO} } }`,
};
