# Changes V7.1 — pagination fix

## Scraper

- Fixed the main Endurance Promotions GridView pagination logic.
- The scraper now only accepts an actual ASP.NET `Page$N` postback for the results GridView instead of clicking any page-number-looking element.
- The scraper prioritizes the `grdIndividualResults` GridView when multiple pagers are present on a page.
- Added a stronger verification step so a page is only considered advanced when the first result rows actually change.
- If the requested page cannot be found or the grid does not change, the scraper stops that race with a clear diagnostic instead of silently duplicating page 1.
- No athlete names, teams, or individual races are hard-coded.
- Existing boys/girls detection and 2.5K/5K distance handling are retained.
