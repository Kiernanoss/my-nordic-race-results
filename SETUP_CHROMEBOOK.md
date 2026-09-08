# My Nordic Race Results — Chromebook setup

## The important part

You do **not** need the Google Play Store to use the finished site. The production version is a normal website/PWA, so you open it in Chrome.

The scraper runs remotely in GitHub Actions. Your Chromebook does not need Node.js, Playwright, Linux, or the Play Store just to use the app.

## Recommended setup

1. Create a free GitHub account at https://github.com/.
2. Create a new repository named `my-nordic-race-results`.
3. Upload the contents of this folder to that repository.
4. In GitHub, open **Settings → Pages** and set the source to **GitHub Actions**.
5. Open the **Actions** tab and run **Build, scrape, and publish NRR** once with **Run workflow**.
6. GitHub will publish the site. Open the URL shown by the deployment.
7. On the Chromebook, bookmark the site or use Chrome's **Install** option if it offers one. It works through the browser; no Play Store is required.

The scheduled workflow refreshes Endurance Promotions data every six hours. You can also run it manually whenever you want a fresh scrape.

## Optional: Chromebook development

If you want to edit/run the project locally, ChromeOS can provide a Debian Linux development environment under Settings → Developers → Linux development environment. This is optional for normal use of the website.

## Security

The scraper only reads public Endurance Promotions result pages. It does not log in or submit data.
