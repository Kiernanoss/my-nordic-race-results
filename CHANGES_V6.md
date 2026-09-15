# Fixes V6

## Scraper
- Scrapes the complete Endurance Promotions result GridView instead of stopping after the first page.
- Uses the live browser DOM to trigger ASP.NET result-page postbacks.
- Keeps the full result grid so BJV, BVAR, GJV, and GVAR are all collected automatically.
- Sets the result grid to 50 rows when the page-size control is available.
- Parses the largest result table as the main GridView to avoid relying on the small field-summary table.
- Keeps PDF/TXT fallback handling for championship pages whose HTML grid is empty.
- Keeps per-race male/female/unknown diagnostics.
- Does not hard-code athlete names, teams, or races.

## Website
- "Around Me" is restricted to the athlete's same official field, so JV and Varsity are never mixed.
- Time gaps are calculated separately by class/distance.
- Athlete comparisons only count shared races with the same distance.
- Comparison pages explicitly show when shared races were excluded because distances differ.

## Updates
- The existing GitHub Action schedule/manual run behavior is retained.
- Refresh Results reloads the published `results.json`; the GitHub Action remains responsible for scraping Endurance Promotions.
