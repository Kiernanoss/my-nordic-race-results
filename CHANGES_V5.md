# NRR V5 changes

This version keeps the existing project structure and does not hard-code athlete names, teams, or races.

## Scraper
- Starts Nordic discovery at RaceKey 1723.
- Uses Playwright for Endurance Promotions result pages because the site uses ASP.NET postbacks for field filters and pagination.
- Visits every available boys/girls field and follows every result page.
- Keeps the memory safeguards: Node heap 6144 MB, concurrency 4, batch size 10.
- Records per-race male/female/unknown row counts in diagnostics.
- Keeps TXT/PDF fallbacks.

## Website
- Uses stable athlete identity based on athlete name + school/team/city rather than ResultsKey.
- Refresh replaces the published imported dataset instead of merging stale copies into it.
- Profile changes clear prior "me" confirmations.
- 5K and 2.5K are tracked separately. Varsity fields are treated as 5K and JV fields as 2.5K.
- Fastest/best time displays are separated into Best 5K and Best 2.5K.
- Performance time chart uses pace per km so a 5K and 2.5K raw time are not incorrectly compared.

## GitHub Actions
- Keeps manual workflow runs.
- Runs automatically every 6 hours.
- Scrapes with batch size 10 and concurrency 4.
