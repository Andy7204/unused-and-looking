# Launch checklist: Unused & Looking

Everything is built, tested and committed locally. These steps are yours.

## 1. Ship it

```bash
cd Z:\claude-builds\unused-and-looking
gh repo create unused-and-looking --public --source . --push
```

Then turn on GitHub Pages: open **Settings → Pages → Source: GitHub Actions**. The `pages.yml` workflow deploys on every push to `main`. The demo goes live at https://andy7204.github.io/unused-and-looking/.

Publish to npm (the name `unused-and-looking` was free on 2026-10-03; check again with `npm view unused-and-looking`):

```bash
npm login
npm publish
```

Then check that it works from a clean folder: `npx unused-and-looking --demo`.

Set the repo description, website and topics:

```bash
gh repo edit Andy7204/unused-and-looking --description "Your codebase is full of lonely functions. Swipe through unused code like a dating app. JS/TS, Python, Go, Ruby. Zero deps." --homepage "https://andy7204.github.io/unused-and-looking/" --add-topic dead-code --add-topic unused-code --add-topic static-analysis --add-topic refactoring --add-topic code-quality --add-topic cli --add-topic javascript --add-topic typescript --add-topic python --add-topic golang --add-topic ruby --add-topic developer-tools
```

## 2. Record the demo GIF (10–15 s)

Shot list:
1. (0–2 s) Landing page. Click **Try the demo repo**.
2. (2–5 s) The `love()` card appears with hearts. Swipe it right slowly with the mouse, so the "MATCH" stamp shows.
3. (5–8 s) Swipe `formatLegacyDate()` right. The "It's a match!" modal shows the inline duplicate at 49% and the `formatDate()` cousin.
4. (8–11 s) Swipe two cards left with the ← key. The Breakups counter goes up.
5. (11–14 s) Open **Breakups** and click **Copy as Markdown**. Cut to **Stats** and the share card.

Tools: **ScreenToGif** on Windows (https://www.screentogif.com) or **Kap** on Mac (https://getkap.co). Record at 1280×800, export at 15 fps and keep it under 5 MB. Save it as `docs/demo.gif`, then replace the `<!-- Replace with docs/demo.gif -->` line in the README with `![demo](docs/demo.gif)`.

## 3. Launch posts (ready to paste)

### Show HN

**Title:** Show HN: Unused & Looking – swipe through your dead code like a dating app

**First comment:**
> I wanted a dead-code finder I'd actually enjoy running, so I made one where every unused function gets a dating profile. You get a generated avatar, its "age" (days since git last touched those lines), a bio, interests and red flags ("has 5 parameters", "uses var"). Swipe right to see where it could belong: duplicated logic elsewhere, call sites of similarly named functions, or inline code doing the same thing. Swipe left to add it to a Breakup List you can export as Markdown for a cleanup PR.
>
> Under the hood it's a small zero-dependency analyser (regex/token based, no parsers) for JS/TS, Python, Go and Ruby. The same module runs in `npx unused-and-looking` and in the browser. I spent most of the time on false positives: JSX usage, Next.js route exports, React lifecycles, Python decorators and dunders, pytest, Go interface methods, Rails actions, entry points in pyproject/package.json, and names built at runtime like `this["voice_" + x]`. Each orphan gets a confidence score, and only ≥50% shows by default. On a dozen well-known repos it mostly says "happily married", which is the point.
>
> It never edits code. The web version runs entirely in your browser (GitHub API + raw.githubusercontent.com only). I'd love false-positive reports.

### Reddit

**r/programming** (link post; self-promo is fine if you engage in the comments):
> Title: I made a dating app for dead code: unused functions get profiles, you swipe left to delete them

**r/javascript** (Showoff Saturday thread, or a link post on Saturday):
> Built a zero-dependency CLI + web app that finds unused JS/TS functions (also Python/Go/Ruby) and lets you swipe through them Tinder-style. It understands JSX, Next.js route exports and React lifecycles, so it doesn't flag your components. Feedback on false positives very welcome: `npx unused-and-looking`

**r/Python** (use the "Showcase" flair and fill in the template: What it does / Target audience / Comparison):
> What it does: finds unused functions and methods (dunders, decorators, pytest, `__all__` and pyproject entry points count as alive) and shows them as swipeable dating profiles. Target audience: anyone cleaning up a codebase who's tired of vulture's wall of text. Comparison: vulture is more thorough for Python-only projects; this one is multi-language, gives confidence scores, finds duplicate logic and is more fun. `npx unused-and-looking` (needs Node).

### X thread

1. Your codebase is full of lonely functions. I built a dating app for them. 💔 Swipe left to delete, right to find where they belong. `npx unused-and-looking` https://andy7204.github.io/unused-and-looking/ [attach demo.gif]
2. Every unused function gets a profile: a generated avatar, "age" = days since git last touched it, interests from what the code does, and red flags. "formatLegacyDate(), 1,402 days single. 5 params. Looking for someone who parses dates." [share-card.png]
3. Swipe right and it finds matches: copy-pasted logic elsewhere, call sites of similarly named functions, inline code doing the same job. Each comes with a compatibility %.
4. Swipe left and it goes on the Breakup List, which exports as a Markdown checklist for your cleanup PR. It never deletes anything itself.
5. It's careful: JSX, Next.js routes, React lifecycles, Python decorators, Go interfaces, Rails actions and runtime-built names count as alive, and every orphan has a confidence score. JS/TS, Python, Go, Ruby. Zero deps.
6. Paste a GitHub repo, pick a local folder, or run it in your terminal. There's also a hidden easter egg if your codebase has a function called love(). ❤️ https://github.com/Andy7204/unused-and-looking

### dev.to article outline

**Title:** I built a dating app for dead code (and learned how hard "unused" is to define)
1. The hook: dead-code tools are joyless, so I made one with feelings.
2. Demo GIF and how to try it in 10 seconds.
3. The core trick: strip comments and strings but keep interpolations (why `${}` and f-strings matter).
4. False positives are the whole game: JSX, framework entry points, decorators, interfaces, `this[\`voice_${x}\`]`. Include the real false positives I hit and fixed (the Ruby `?"` char literal!).
5. Confidence scoring instead of a yes/no answer.
6. Matchmaking with token shingles: finding the copy-paste you forgot.
7. One analyser, two runtimes: the same ES module in Node and the browser, with zero dependencies.
8. Results on real repos: precision, and why "happily married" is a good result.
9. Ask: send me your false positives.

### Product Hunt

**Tagline:** A dating app for your dead code

**Description:** Unused & Looking finds unused functions in JavaScript/TypeScript, Python, Go and Ruby, and turns each one into a swipeable dating profile with an avatar, age, bio and red flags. Swipe right to see duplicated logic and places it could belong. Swipe left to add it to a Breakup List you can export for a cleanup PR. It runs in your browser (paste a GitHub repo) or via `npx unused-and-looking`. Zero dependencies, read-only, private by design.

## 4. Timing tips

- Post Show HN on Tuesday–Thursday, 8–10am US Eastern. Reply to every comment in the first 2 hours.
- Post r/javascript on Saturday (Showoff Saturday). Space the subreddits out over 2–3 days and don't cross-post the same day.
- Publish the dev.to article 1–2 days after HN, linking to the discussion.
- Launch Product Hunt at 12:01am Pacific on a Tuesday or Wednesday. Have the GIF and 3 screenshots ready.
- Pin the X thread. Reply to people who post their share cards.

## 5. Follow-up ideas (keep the repo active)

1. **GitHub Action**: `Andy7204/unused-and-looking@v1` comments on PRs: "This PR made 3 functions single 💔".
2. **More languages**: Rust, PHP, Kotlin, Swift (contributor-friendly: one extractor plus fixtures each).
3. **"Couples therapy" mode**: merge suggestions for near-twin functions, with a diff preview.
4. **Leaderboard of famous repos**: "loneliest function in React / Django / Kubernetes", refreshed monthly. Good content for posts.
5. **VS Code extension**: CodeLens above each orphan ("💔 single for 412 days · 91% sure").
