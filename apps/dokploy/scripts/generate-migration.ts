#!/usr/bin/env tsx
/**
 * Migration Generation Helper Script
 *
 * This script wraps drizzle-kit generate to enforce meaningful migration names.
 * It prevents the creation of migrations with random/auto-generated names.
 *
 * Usage:
 *   pnpm run migration:new <migration-name>
 *
 * Examples:
 *   pnpm run migration:new add-user-preferences
 *   pnpm run migration:new update-notification-schema
 *   pnpm run migration:new remove-deprecated-columns
 *
 * Naming conventions:
 *   - Use kebab-case (lowercase with hyphens)
 *   - Start with a verb: add, update, remove, create, alter, fix, etc.
 *   - Be descriptive but concise
 *   - Avoid generic names like "changes" or "updates"
 */

import { execSync } from "node:child_process";
import * as path from "node:path";

const VALID_PREFIXES = [
	"add",
	"update",
	"remove",
	"create",
	"alter",
	"fix",
	"rename",
	"drop",
	"modify",
	"init",
	"migrate",
	"refactor",
	"enable",
	"disable",
	"setup",
];

const FORBIDDEN_NAMES = [
	"changes",
	"updates",
	"migration",
	"new",
	"test",
	"temp",
	"tmp",
	"fix",
	"bug",
	"feature",
];

function printUsage(): void {
	console.log(`
Migration Generation Helper
===========================

Usage: pnpm run migration:new <migration-name>

Arguments:
  migration-name    A descriptive name for the migration in kebab-case

Examples:
  pnpm run migration:new add-user-preferences
  pnpm run migration:new update-notification-schema
  pnpm run migration:new remove-deprecated-columns
  pnpm run migration:new create-audit-log-table
  pnpm run migration:new rename-email-to-username

Naming conventions:
  - Use kebab-case (lowercase letters and hyphens only)
  - Start with a verb: ${VALID_PREFIXES.slice(0, 5).join(", ")}, etc.
  - Be descriptive but concise (3-50 characters)
  - Describe WHAT the migration does, not WHY

Bad examples:
  - "changes" (too generic)
  - "fix-bug" (not descriptive)
  - "UserPreferences" (not kebab-case)
  - "add_user_preferences" (use hyphens, not underscores)
`);
}

function validateMigrationName(name: string): { valid: boolean; error?: string } {
	// Check if name is provided
	if (!name || name.trim() === "") {
		return { valid: false, error: "Migration name is required" };
	}

	// Check length
	if (name.length < 3) {
		return { valid: false, error: "Migration name must be at least 3 characters" };
	}

	if (name.length > 50) {
		return { valid: false, error: "Migration name must be 50 characters or less" };
	}

	// Check for kebab-case format (lowercase letters, numbers, and hyphens)
	if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && !/^[a-z][a-z0-9]*$/.test(name)) {
		return {
			valid: false,
			error:
				"Migration name must be in kebab-case (lowercase letters, numbers, and hyphens only)",
		};
	}

	// Check for double hyphens
	if (name.includes("--")) {
		return { valid: false, error: "Migration name cannot contain double hyphens" };
	}

	// Check for forbidden generic names
	if (FORBIDDEN_NAMES.includes(name.toLowerCase())) {
		return {
			valid: false,
			error: `Migration name "${name}" is too generic. Please be more descriptive.`,
		};
	}

	// Warn if name doesn't start with a common verb (but don't reject)
	const startsWithVerb = VALID_PREFIXES.some((prefix) =>
		name.toLowerCase().startsWith(prefix),
	);

	if (!startsWithVerb) {
		console.warn(
			`\nWarning: Migration name "${name}" doesn't start with a common verb.`,
		);
		console.warn(`Consider using one of: ${VALID_PREFIXES.join(", ")}\n`);
	}

	return { valid: true };
}

async function generateMigration(name: string): Promise<void> {
	const configPath = path.join(process.cwd(), "server/db/drizzle.config.ts");

	console.log(`\nGenerating migration: ${name}\n`);

	try {
		// Run drizzle-kit generate with the custom name
		execSync(`drizzle-kit generate --config ${configPath} --name=${name}`, {
			stdio: "inherit",
			cwd: process.cwd(),
		});

		console.log(`\nMigration "${name}" generated successfully!`);
		console.log("\nNext steps:");
		console.log("1. Review the generated SQL in the drizzle/ folder");
		console.log("2. Test the migration locally: pnpm run migration:run");
		console.log("3. Commit the migration files with your schema changes\n");
	} catch (error) {
		console.error("\nFailed to generate migration.");
		if (error instanceof Error && error.message.includes("No schema changes")) {
			console.log(
				"No schema changes detected. Make sure you've modified the schema files first.",
			);
		}
		process.exit(1);
	}
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
	printUsage();
	process.exit(args.length === 0 ? 1 : 0);
}

const migrationName = args[0];
const validation = validateMigrationName(migrationName);

if (!validation.valid) {
	console.error(`\nError: ${validation.error}\n`);
	printUsage();
	process.exit(1);
}

generateMigration(migrationName);
