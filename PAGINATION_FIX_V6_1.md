# Pagination fix based on v6

This build starts from the exact v6 archive and preserves its scraper/site code.

The scraper's page-turning code was changed so it:

- prefers the visible pager control in the actual results grid;
- avoids choosing hidden/secondary `Page$2` postbacks;
- clicks the live pager control instead of immediately calling a possibly wrong `__doPostBack` target;
- waits for the result rows to actually change after the click;
- falls back to the individual-results GridView postback only if no visible pager control can be found;
- logs when it clicks the live pager and when the page did not actually change.

No athlete names, teams, races, or gender fields were hard-coded.
