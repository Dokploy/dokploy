/**
 * Shell escaping utilities for safe command construction
 * Prevents command injection vulnerabilities by properly escaping shell arguments
 */

/**
 * Escape a string for safe use in shell commands
 * Wraps the string in single quotes and escapes any single quotes within
 * @param s - String to escape (can be undefined)
 * @returns Escaped string safe for shell use
 */
export function shEscape(s: string | undefined): string {
	if (!s) return "''";
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Escape a single shell argument
 * Alias for shEscape for clarity
 */
export function escapeShellArg(value: string): string {
	return shEscape(value);
}

/**
 * Escape an array of shell arguments
 * @param args - Array of strings to escape
 * @returns Array of escaped strings
 */
export function escapeShellArgs(args: string[]): string[] {
	return args.map((arg) => shEscape(arg));
}

/**
 * Validate Docker container ID format
 * Container IDs are either:
 * - 64 hexadecimal characters (full ID)
 * - 12 hexadecimal characters (short ID)
 * - Empty string (for validation purposes)
 * @param id - Container ID to validate
 * @returns true if valid, false otherwise
 */
export function validateContainerId(id: string): boolean {
	if (!id || id.length === 0) {
		return false;
	}
	// Docker container IDs are hexadecimal
	const hexPattern = /^[a-f0-9]{12,64}$/i;
	return hexPattern.test(id);
}

/**
 * Validate shell type is from allowed whitelist
 * @param type - Shell type to validate
 * @returns true if valid, false otherwise
 */
export function validateShellType(type: string): boolean {
	const allowedShells = ["sh", "bash", "zsh", "ash", "dash", "fish", "csh", "tcsh"];
	return allowedShells.includes(type.toLowerCase());
}

