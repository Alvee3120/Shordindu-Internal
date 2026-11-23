# Taste

## Data storage

- Wants the database kept as light as possible: binary/large assets (e.g. profile pictures) should live on disk or in object storage with only a filename/URL in the DB — not as byte columns in Postgres. Confidence: 0.65

## Workflow

- Wants new features proven locally first (dev server + real browser verification) and only then deployed to production — explicitly asks to "first apply it locally, then deploy". Confidence: 0.7

## Tooling

- Doesn't want to use Docker for local development right now; prefers running the database natively (local PostgreSQL install or a private local cluster) and keeping Docker Compose around only as a later option. Confidence: 0.7
- When adding new required config keys, expects the actual local `.env` to be updated as well as `.env.example` — updating only the committed template is a miss (with empty placeholders left for secrets). Confidence: 0.7
- Wants security/abuse guards (e.g. the failed-login lockout) active in production but bypassed in development, so manual testing isn't blocked — environment-gated, not removed. Confidence: 0.6
