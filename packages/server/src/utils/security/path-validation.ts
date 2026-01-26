import path from "node:path";
import { paths } from "../../constants";

/**
 * Path validation utilities for preventing directory traversal attacks
 * Ensures all file operations are restricted to allowed directories
 */

/**
 * Validate that a path is within a base directory
 * Prevents directory traversal attacks by ensuring resolved path starts with base
 * @param userPath - User-provided path to validate
 * @param basePath - Base directory that the path must be within
 * @returns true if path is safe, false otherwise
 */
export function validatePath(userPath: string, basePath: string): boolean {
	if (!userPath || !basePath) {
		return false;
	}

	// Prevent directory traversal patterns
	if (userPath.includes("../") || userPath.includes("..\\")) {
		return false;
	}

	// Prevent null bytes
	if (userPath.includes("\0") || userPath.includes("\x00")) {
		return false;
	}

	try {
		// Resolve both paths to absolute paths
		const resolvedBase = path.resolve(basePath);
		const resolvedUser = path.resolve(basePath, userPath);

		// Ensure the resolved user path starts with the resolved base path
		// This prevents directory traversal
		return (
			resolvedUser.startsWith(resolvedBase + path.sep) ||
			resolvedUser === resolvedBase
		);
	} catch {
		// If path resolution fails, it's not safe
		return false;
	}
}

/**
 * Sanitize a path by removing dangerous characters and normalizing
 * @param userPath - Path to sanitize
 * @returns Sanitized path
 */
export function sanitizePath(userPath: string): string {
	if (!userPath) {
		return "";
	}

	// Remove null bytes
	let sanitized = userPath.replace(/\0/g, "").replace(/\x00/g, "");

	// Remove directory traversal patterns
	sanitized = sanitized.replace(/\.\.\//g, "").replace(/\.\.\\/g, "");

	// Normalize path separators
	sanitized = sanitized.replace(/\\/g, "/");

	// Remove leading slashes that could make it absolute
	sanitized = sanitized.replace(/^\/+/, "");

	return sanitized;
}

/**
 * Resolve a path safely with validation
 * Throws an error if the path is not within the base directory
 * @param userPath - User-provided path
 * @param basePath - Base directory
 * @returns Resolved absolute path
 * @throws Error if path is not safe
 */
export function resolveSafePath(userPath: string, basePath: string): string {
	if (!validatePath(userPath, basePath)) {
		throw new Error(
			`Invalid path: path traversal or unauthorized directory access detected. Path: ${userPath}, Base: ${basePath}`,
		);
	}

	try {
		return path.resolve(basePath, userPath);
	} catch (error) {
		throw new Error(
			`Failed to resolve path: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Validate log path is within allowed directories
 * @param logPath - Log path to validate
 * @param serverId - Optional server ID to determine if remote or local
 * @returns true if valid, false otherwise
 */
export function validateLogPath(
	logPath: string,
	serverId?: string | null,
): boolean {
	if (!logPath || logPath === ".") {
		return false;
	}

	const { LOGS_PATH } = paths(!!serverId);
	return validatePath(logPath, LOGS_PATH);
}

/**
 * Validate file path is within allowed application directories
 * @param filePath - File path to validate
 * @param basePath - Base path for the application
 * @returns true if valid, false otherwise
 */
export function validateFilePath(filePath: string, basePath: string): boolean {
	if (!filePath) {
		return false;
	}

	return validatePath(filePath, basePath);
}
