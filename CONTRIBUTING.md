# Contributing

Thanks for helping lonely functions find love.

## Run it locally

```bash
git clone https://github.com/Andy7204/unused-and-looking
cd unused-and-looking
node src/cli.js --demo          # CLI on the bundled demo repo
node src/cli.js /path/to/repo   # CLI on anything
npm start                       # web app at http://localhost:5186
```

There are no dependencies to install. Node 18+ is all you need.

## Tests

```bash
npm test
```

Tests live in `test/` and use `node:test`. The fixture apps are in `fixtures/` (one per language). Each one has planted orphans and false-positive traps. If you fix a false positive, add a trap for it to the matching fixture so it stays fixed.

If you edit `demo/`, run `npm run build:demo` to refresh `web/demo-repo.json` (a test checks they match).

## Layout

- `src/core/`: the analyser, shared by the CLI and the browser. Pure functions, no Node APIs.
- `src/cli.js`, `src/node/`: the CLI, file reading, git blame ages and the `--swipe` server.
- `web/`: the GitHub Pages app. It imports `src/core` (served at `/core/`).

## Ideas wanted

- More framework rules (Django signals, Rails concerns, NestJS, Angular, Phoenix...).
- New languages (Rust, PHP, Kotlin, Swift).
- Better matchmaking reasons and funnier bio templates.
- False-positive reports. These are the most valuable thing you can send.
