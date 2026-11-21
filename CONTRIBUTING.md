# Contributing to Apercura

Thanks for helping. This guide covers how work is organised and what a pull request needs.

## Language

Everything in the repository is written in **English**: code, identifiers, comments, docs,
commit messages, branch names, issues and pull requests. User-facing text is never hard-coded:
it goes through the message catalogs in `apps/web/messages/` (`en.json` is the source of truth,
other locales translate it).

## Workflow

1. Pick or open an issue first, so the work is discussed before it is written.
2. Create a branch named `issue-<number>-<slug>`, for example `issue-12-practitioner-search`.
3. Keep pull requests focused on one issue and reference it (`Closes #12`).

## Commits

- **Sign every commit** (GPG or SSH). The `main` branch only accepts verified signatures.
  Check with `git log --format='%h %G? %s' -1` (`G` means a good signature).
- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(web): ...`,
  `fix(db): ...`, `chore: ...`, `docs: ...`, `ci: ...`.

## Before opening a pull request

```sh
bun run check:write   # Biome: format and lint
bun run typecheck
bun run test
bun run build
```

CI runs the same commands and also applies the database migrations to a fresh PostGIS
database.

- **Formatting and linting** use [Biome](https://biomejs.dev). Do not add Prettier or ESLint.
- **Tests**: domain logic lives in `packages/core` and must come with Vitest tests. Use
  synthetic data in tests; never commit real practitioner or patient data.
- **Database changes** go through Drizzle: edit the schema in `packages/db/src/schema`, run
  `bun run db:generate`, and commit the generated SQL with its snapshot. Timestamps are always
  `timestamp({ withTimezone: true })`.

## Development setup

See the quick start in the [README](./README.md#quick-start).
