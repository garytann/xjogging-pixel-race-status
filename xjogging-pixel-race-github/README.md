# xJogging Pixel Race Live

A live, pixel-art leaderboard for the HTX Annual Walk & Run 2026. The page reads the public 42campaign team APIs directly in each visitor's browser and refreshes once every 60 seconds while the tab is visible.

## What is included

- Live team distance, rank, member count, and member standings
- Seven deterministic pixel runners with a leader crown
- Rank-change and distance-change indicators
- Cached last-known standings if the event API is temporarily unavailable
- Responsive phone, desktop, and display-screen layouts
- Reduced-motion accessibility support
- GitHub Pages deployment workflow

No authorization token or participant invite code is stored or displayed.

## Run locally

Install Node.js 22, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Publish with GitHub Pages

1. Create an empty GitHub repository.
2. Upload or push every file in this project, including the `.github` directory.
3. Make sure the default branch is named `main`.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, select **GitHub Actions** as the source.
6. Open the repository's **Actions** tab.
7. Select **Deploy leaderboard to GitHub Pages**.
8. Choose **Run workflow**, keep the `main` branch selected, and run it.

The same workflow runs automatically whenever a new commit is pushed to `main`. When deployment finishes, its summary contains the public website URL.

## Build a Pages copy locally

```bash
npm run build:pages
```

The static website is created in `out/`.

## Change the event or team

Edit `APP_SLUG` and `TEAM_ID` near the top of `app/page.tsx`. The current values point to the xJogging team supplied with this project.

## Refresh behavior

GitHub Actions is used only for deployment. Live standings do not wait for a scheduled Action: the published JavaScript requests the API on page load and once per minute while the page is visible. Hidden tabs pause polling to reduce traffic.
