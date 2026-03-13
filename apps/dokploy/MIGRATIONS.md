# Database Migrations Guide

This document explains how to work with database migrations in Dokploy using Drizzle ORM.

## Overview

Dokploy uses [Drizzle ORM](https://orm.drizzle.team/) for database management. Migrations are stored in the `drizzle/` folder and use **timestamp-based prefixes** (e.g., `20240627123900_add-user-preferences.sql`) to prevent merge conflicts when multiple developers work on schema changes simultaneously.

## Migration Commands

| Command | Description |
|---------|-------------|
| `pnpm run migration:new <name>` | Generate a new migration with a descriptive name |
| `pnpm run migration:run` | Apply all pending migrations |
| `pnpm run migration:generate` | Generate migration from schema changes (raw drizzle-kit) |
| `pnpm run migration:up` | Update migration metadata |
| `pnpm run migration:drop` | Drop a migration |
| `pnpm run db:push` | Push schema directly to database (development only) |
| `pnpm run db:studio` | Open Drizzle Studio to browse the database |

## Creating a New Migration

### Step 1: Modify the Schema

First, make changes to the schema files in `server/db/schema/`:

```typescript
// server/db/schema/user.ts
export const user = pgTable("user", {
  id: text("id").notNull().primaryKey(),
  email: text("email").notNull().unique(),
  // Add your new column
  preferences: jsonb("preferences").default({}),
});
```

### Step 2: Generate the Migration

Use the `migration:new` command with a **descriptive name**:

```bash
pnpm run migration:new add-user-preferences
```

This will:
1. Detect schema changes
2. Generate a migration file with a timestamp prefix
3. Create the corresponding snapshot file

### Step 3: Review the Migration

Check the generated SQL file in `drizzle/`:

```sql
-- 20240627123900_add-user-preferences.sql
ALTER TABLE "user" ADD COLUMN "preferences" jsonb DEFAULT '{}';
```

### Step 4: Test Locally

Apply the migration to your local database:

```bash
pnpm run migration:run
```

### Step 5: Commit Your Changes

Commit both the schema changes and the migration files:

```bash
git add server/db/schema/ drizzle/
git commit -m "feat: add user preferences column"
```

## Migration Naming Conventions

### Required Format

- Use **kebab-case** (lowercase with hyphens): `add-user-preferences`
- **Start with a verb** that describes the action:
  - `add-*` - Adding new columns, tables, or indexes
  - `update-*` - Modifying existing structures
  - `remove-*` - Removing columns, tables, or constraints
  - `create-*` - Creating new tables or schemas
  - `alter-*` - Altering table structures
  - `rename-*` - Renaming columns or tables
  - `fix-*` - Fixing data or schema issues
  - `migrate-*` - Data migrations

### Good Examples

```bash
pnpm run migration:new add-user-preferences
pnpm run migration:new update-notification-schema
pnpm run migration:new remove-deprecated-columns
pnpm run migration:new create-audit-log-table
pnpm run migration:new rename-email-to-username
pnpm run migration:new add-project-description-index
pnpm run migration:new migrate-legacy-permissions
```

### Bad Examples

```bash
# Too generic
pnpm run migration:new changes
pnpm run migration:new updates
pnpm run migration:new fix

# Wrong format
pnpm run migration:new AddUserPreferences  # Not kebab-case
pnpm run migration:new add_user_preferences # Underscores instead of hyphens

# Not descriptive
pnpm run migration:new user-stuff
pnpm run migration:new new-migration
```

## How Timestamp Prefixes Prevent Conflicts

### The Problem with Sequential Numbers

With sequential numbering (`0001_`, `0002_`, etc.), if two developers create migrations from the same base:

```
Developer A: Creates 0134_add-feature-a.sql
Developer B: Creates 0134_add-feature-b.sql
```

Both migrations have the same prefix, causing conflicts when merging.

### The Timestamp Solution

With timestamp prefixes, each migration gets a unique identifier:

```
Developer A: Creates 20240627143052_add-feature-a.sql
Developer B: Creates 20240627143127_add-feature-b.sql
```

Even if created seconds apart, the migrations have unique prefixes and can be merged without conflicts.

## Handling Migration Conflicts

### Scenario: Two PRs with Migrations

If you're working on a PR and another PR with migrations gets merged first:

1. **Pull the latest changes**:
   ```bash
   git checkout main
   git pull origin main
   git checkout your-branch
   git rebase main
   ```

2. **No conflicts expected**: Because timestamp prefixes are unique, there should be no file conflicts.

3. **Run migrations**: Test that all migrations apply correctly:
   ```bash
   pnpm run migration:run
   ```

### Scenario: Schema Conflict

If two migrations modify the same table in incompatible ways:

1. Review both migrations
2. Create a new migration to resolve the conflict if needed
3. Communicate with the other developer

## Custom SQL Migrations

Sometimes you need to write custom SQL that Drizzle can't auto-generate:

1. Generate an empty migration:
   ```bash
   pnpm run migration:new migrate-legacy-data
   ```

2. Edit the generated SQL file to add your custom SQL:
   ```sql
   -- 20240627143052_migrate-legacy-data.sql
   -- Custom SQL migration file

   UPDATE "user" SET "role" = 'admin' WHERE "legacy_admin" = true;
   DELETE FROM "legacy_permissions";
   ```

3. Test thoroughly before committing.

## Best Practices

### DO

- Always use `migration:new` instead of `migration:generate`
- Write descriptive migration names
- Test migrations locally before pushing
- Review generated SQL before committing
- Keep migrations small and focused
- Document complex migrations with SQL comments

### DON'T

- Don't edit existing migrations that have been merged/deployed
- Don't use generic names like "changes" or "updates"
- Don't include multiple unrelated changes in one migration
- Don't commit migrations without testing them
- Don't manually edit `_journal.json`

## Troubleshooting

### "No schema changes detected"

If you run `migration:new` and get this error:

1. Make sure you've saved your schema file changes
2. Check that your schema exports are correct
3. Verify the schema path in `drizzle.config.ts`

### Migration fails to apply

1. Check the error message for details
2. Look at the generated SQL for issues
3. Test the SQL manually in a database client
4. Consider if the migration needs to be split into steps

### Journal out of sync

If the `_journal.json` gets out of sync:

```bash
pnpm run migration:up
```

This updates the migration metadata to match the actual files.

## File Structure

```
apps/dokploy/
├── drizzle/
│   ├── meta/
│   │   ├── _journal.json         # Migration history
│   │   └── *_snapshot.json       # Schema snapshots
│   └── *.sql                     # Migration files
├── server/
│   └── db/
│       ├── drizzle.config.ts     # Drizzle configuration
│       ├── schema/               # Schema definitions
│       └── migration.ts          # Migration runner
└── scripts/
    ├── generate-migration.ts     # Migration helper
    └── convert-migrations-to-timestamp.ts  # Format converter
```

## Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle Kit Commands](https://orm.drizzle.team/docs/kit-overview)
- [Migration Best Practices](https://orm.drizzle.team/docs/migrations)
