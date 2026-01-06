#!/usr/bin/env tsx
/**
 * Migration Conversion Script
 *
 * This script converts existing Drizzle migrations from index-based naming (0001_name.sql)
 * to timestamp-based naming (20240627123900_name.sql) to prevent merge conflicts
 * when multiple developers create migrations in parallel.
 *
 * Usage: pnpm run migration:convert
 *
 * What this script does:
 * 1. Backs up the current drizzle folder
 * 2. Reads _journal.json to get all migration entries with timestamps
 * 3. Renames SQL files from NNNN_name.sql to YYYYMMDDHHmmss_name.sql
 * 4. Renames snapshot files from NNNN_snapshot.json to YYYYMMDDHHmmss_snapshot.json
 * 5. Updates _journal.json with new tags
 *
 * The script is idempotent - running it multiple times is safe.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const DRIZZLE_DIR = path.join(process.cwd(), "drizzle");
const META_DIR = path.join(DRIZZLE_DIR, "meta");
const JOURNAL_PATH = path.join(META_DIR, "_journal.json");
const BACKUP_DIR = path.join(process.cwd(), "drizzle-backup");

interface JournalEntry {
	idx: number;
	version: string;
	when: number;
	tag: string;
	breakpoints: boolean;
}

interface Journal {
	version: string;
	dialect: string;
	entries: JournalEntry[];
}

/**
 * Convert Unix timestamp (milliseconds) to YYYYMMDDHHmmss format
 */
function timestampToPrefix(unixMs: number): string {
	const date = new Date(unixMs);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");

	return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Check if a tag already uses timestamp format
 */
function isTimestampFormat(tag: string): boolean {
	// Timestamp format: 14 digits followed by underscore
	return /^\d{14}_/.test(tag);
}

/**
 * Check if a tag uses index format
 */
function isIndexFormat(tag: string): boolean {
	// Index format: 4 digits followed by underscore
	return /^\d{4}_/.test(tag);
}

/**
 * Extract the name part from a tag (everything after the prefix)
 */
function extractName(tag: string): string {
	if (isTimestampFormat(tag)) {
		return tag.substring(15); // 14 digits + underscore
	}
	if (isIndexFormat(tag)) {
		return tag.substring(5); // 4 digits + underscore
	}
	return tag;
}

/**
 * Create backup of the drizzle folder
 */
function createBackup(): void {
	if (fs.existsSync(BACKUP_DIR)) {
		console.log("Removing existing backup...");
		fs.rmSync(BACKUP_DIR, { recursive: true });
	}

	console.log(`Creating backup at ${BACKUP_DIR}...`);
	fs.cpSync(DRIZZLE_DIR, BACKUP_DIR, { recursive: true });
	console.log("Backup created successfully.");
}

/**
 * Main conversion function
 */
async function convertMigrations(): Promise<void> {
	console.log("\n=== Drizzle Migration Format Converter ===\n");

	// Check if drizzle directory exists
	if (!fs.existsSync(DRIZZLE_DIR)) {
		console.error("Error: drizzle directory not found at", DRIZZLE_DIR);
		process.exit(1);
	}

	// Check if journal exists
	if (!fs.existsSync(JOURNAL_PATH)) {
		console.error("Error: _journal.json not found at", JOURNAL_PATH);
		process.exit(1);
	}

	// Read current journal
	const journalContent = fs.readFileSync(JOURNAL_PATH, "utf-8");
	const journal: Journal = JSON.parse(journalContent);

	// Check if already converted
	const alreadyTimestamp = journal.entries.every((entry) =>
		isTimestampFormat(entry.tag),
	);
	if (alreadyTimestamp) {
		console.log(
			"Migrations are already in timestamp format. No conversion needed.",
		);
		return;
	}

	// Check if all entries are in index format
	const allIndex = journal.entries.every((entry) => isIndexFormat(entry.tag));
	if (!allIndex) {
		const mixedEntries = journal.entries.filter(
			(entry) => !isIndexFormat(entry.tag) && !isTimestampFormat(entry.tag),
		);
		if (mixedEntries.length > 0) {
			console.error(
				"Error: Found entries with unknown format:",
				mixedEntries.map((e) => e.tag),
			);
			process.exit(1);
		}
	}

	console.log(`Found ${journal.entries.length} migrations to convert.\n`);

	// Create backup before making changes
	createBackup();

	// Track renames for summary
	const renames: Array<{ oldTag: string; newTag: string }> = [];

	// Process each entry
	for (const entry of journal.entries) {
		const oldTag = entry.tag;
		const name = extractName(oldTag);
		const timestampPrefix = timestampToPrefix(entry.when);
		const newTag = `${timestampPrefix}_${name}`;

		// Rename SQL file
		const oldSqlPath = path.join(DRIZZLE_DIR, `${oldTag}.sql`);
		const newSqlPath = path.join(DRIZZLE_DIR, `${newTag}.sql`);

		if (fs.existsSync(oldSqlPath)) {
			fs.renameSync(oldSqlPath, newSqlPath);
		} else {
			console.warn(`Warning: SQL file not found: ${oldSqlPath}`);
		}

		// Rename snapshot file
		// Drizzle uses just the index for snapshots: 0000_snapshot.json
		const oldIndexOnly = oldTag.split("_")[0];
		const oldSnapshotPath = path.join(META_DIR, `${oldIndexOnly}_snapshot.json`);
		const newSnapshotPath = path.join(META_DIR, `${timestampPrefix}_snapshot.json`);

		if (fs.existsSync(oldSnapshotPath)) {
			fs.renameSync(oldSnapshotPath, newSnapshotPath);
		} else {
			console.warn(`Warning: Snapshot file not found: ${oldSnapshotPath}`);
		}

		// Update entry tag
		entry.tag = newTag;
		renames.push({ oldTag, newTag });
	}

	// Write updated journal
	fs.writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2));

	// Print summary
	console.log("\n=== Conversion Summary ===\n");
	console.log(`Converted ${renames.length} migrations:\n`);

	// Show first 5 and last 5 renames
	const showCount = 5;
	if (renames.length <= showCount * 2) {
		for (const { oldTag, newTag } of renames) {
			console.log(`  ${oldTag}.sql -> ${newTag}.sql`);
		}
	} else {
		for (let i = 0; i < showCount; i++) {
			const { oldTag, newTag } = renames[i];
			console.log(`  ${oldTag}.sql -> ${newTag}.sql`);
		}
		console.log(`  ... (${renames.length - showCount * 2} more) ...`);
		for (let i = renames.length - showCount; i < renames.length; i++) {
			const { oldTag, newTag } = renames[i];
			console.log(`  ${oldTag}.sql -> ${newTag}.sql`);
		}
	}

	console.log(`\nBackup saved to: ${BACKUP_DIR}`);
	console.log("\n=== Conversion Complete ===\n");
	console.log("Next steps:");
	console.log(
		"1. Verify the migrations by running: pnpm run migration:run (on a test database)",
	);
	console.log("2. Update drizzle.config.ts to use timestamp prefix");
	console.log("3. Delete the backup folder after verification");
	console.log("");
}

// Run the conversion
convertMigrations().catch((error) => {
	console.error("Conversion failed:", error);
	process.exit(1);
});
