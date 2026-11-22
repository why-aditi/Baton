// Persisted Teamwork Graph queries are immutable and owned by the app ID; any change means a new key.
// Registered 2026-11-16 via POST /gateway/api/twg/cypher-queries (same app ID as spike/).
// PQ_USER_OWNED_PAGES:
//   MATCH (user:AtlassianUser {ari: $userId})
//     -[:atlassian_user_owns_confluence_page|atlassian_user_created_confluence_page]->(page:ConfluencePage)
//   RETURN page
export const PQ_USER_OWNED_PAGES = '25f1fc29-ed3c-4006-a2ce-1d96f975d9b1';
// No PQ_ITEM_COLLABORATORS: buildInventory gets collaborators from page contributors and issue
// commenters instead (src/graph/inventory.ts). Register one only if that proves too slow.
