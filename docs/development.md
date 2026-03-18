# Development

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL
- Redis

## Setup

```bash
npm install
npm run prisma:generate
npm run db:start
npx prisma migrate deploy
npm run dev
```

## Common commands

```bash
npm run dev
npm run build
npm run typecheck
npm run test:unit
npm run test:integration:db
npm run db:validate:fresh
```

## Local workflow

Recommended developer loop:

1. make focused changes
2. run `npm run typecheck`
3. run the smallest relevant test target
4. run `npm run build` before finishing cross-cutting work

For schema-affecting changes:

1. update `prisma/schema.prisma`
2. create and review the migration
3. run:
   - `npm run prisma:format`
   - `npm run prisma:validate`
   - `npm run prisma:generate`
   - `npm run db:validate:fresh`

## Branching and change discipline

- keep changes small and reviewable
- avoid broad refactors unless they remove real risk or drift
- prefer deterministic service logic over duplicated router logic
- keep UI changes thin when the source of truth already exists in persisted records

## Testing notes

- unit tests live in `test/unit`
- DB-backed integration tests live in `test/integration`
- `scripts/run-integration-db.mjs` provisions an isolated integration database

## Local artifacts

Do not commit:

- logs
- HTML dumps
- temporary packet exports
- local env files
- local tool runtime folders

The repo `.gitignore` is configured to keep those out of version control.
