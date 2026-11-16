# Recorded Teamwork Graph responses

The normalizers in `src/graph/` are tested against real responses saved here, one file per query,
e.g. `assignedJira.meera.json`. Record them with the spike page in Jira (Apps → Baton spike):

1. **Inspect types** with `Query` plus each `__typename` the probe shows (`JiraWorkItem`,
   `ConfluencePage`, the pull request type, the team type…). Save the output as `schema.json`. It lists
   every field and each curated query's arguments.
2. Write a query that selects the fields Baton needs, run it with **Run raw query** against a seeded
   user, and save the whole JSON response here.

Only record seeded Northwind Pay users, never real people. Re-record after reseeding.
