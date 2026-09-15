# NRR V7.2 scraper fix

## Why V7.1 lost results
V7.1 changed the scraper from the older field-by-field approach to one combined BJV/BVAR/GJV/GVAR grid. Endurance Promotions can show the combined grid with several pages, but the live pager is not reliably exposed to the browser automation. V7.1 therefore stopped after page 1 on many races.

That caused two problems at once:
- girls disappeared from races where their rows were on later pages;
- athletes lost races because later pages were never collected.

## What V7.2 does instead
V7.2 restores the field-by-field method that was working better in the previous scraper:

1. Discover the race normally.
2. Find the site's actual field selector.
3. Automatically collect every available field: BJV, BVAR, GJV, and GVAR.
4. Reload the race before each field so the selection is independent.
5. Set the result page size to 50 when available.
6. Follow pagination inside that selected field when a field has more than one page.
7. Deduplicate rows without hard-coding athlete names, teams, or races.
8. Keep the TXT/PDF fallback for races whose HTML grid is empty.
9. Report male/female counts for every race.

This does not add any athlete names manually. A new skier appearing in Endurance Promotions will be picked up automatically if they are present in one of the race fields.

## Website
No website athlete data is hard-coded by this fix. The existing website code remains in place, including the separate 5K/2.5K handling and athlete-selection behavior.
