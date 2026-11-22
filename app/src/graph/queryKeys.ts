// Persisted Teamwork Graph queries are immutable and owned by the app ID; any change means a new key.
// Registered 2026-11-16 via POST /gateway/api/twg/cypher-queries (same app ID as spike/).
// PQ_USER_OWNED_PAGES:
//   MATCH (user:AtlassianUser {ari: $userId})
//     -[:atlassian_user_owns_confluence_page|atlassian_user_created_confluence_page]->(page:ConfluencePage)
//   RETURN page
export const PQ_USER_OWNED_PAGES = '25f1fc29-ed3c-4006-a2ce-1d96f975d9b1';

// PQ_PAGE_INBOUND_REFS (registered 2026-11-22): pages that link to a page, for "widely referenced".
//   MATCH (src:ConfluencePage)-[:content_entity_links_entity]->(page:ConfluencePage {ari: $pageId})
//   RETURN src
// Tested on the demo site: counts native page links and plain URL links, indexed within ~4 minutes.
// (entity_links_entity, registered as e4f4157c-bd57-4c1d-9ef7-5d9fdc8eb354, returned nothing: unused.)
export const PQ_PAGE_INBOUND_REFS = '420a506c-5569-41e7-b623-49870ea92967';
// No PQ_ITEM_COLLABORATORS: buildInventory gets collaborators from page contributors and issue
// commenters instead (src/graph/inventory.ts). Register one only if that proves too slow.
