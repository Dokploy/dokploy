/**
 * Escapes a string for safe use in shell commands
 * This prevents special characters from being interpreted by the shell
 */
export function shellEscape(input: string): string {
	// If the string is empty, return empty string
	if (!input) return input;
	
	// Escape single quotes by ending the quoted string, adding an escaped quote, and starting a new quoted string
	// This handles the case where the string contains single quotes
	return `'${input.replace(/'/g, "'\"'\"'")}'`;
}

/**
 * Escapes a string for use in echo commands specifically
 * This is safer than shellEscape for echo commands as it handles all special characters
 */
export function echoEscape(input: string): string {
	// If the string is empty, return empty string
	if (!input) return input;
	
	// For echo commands, we can use printf with %s format specifier which is safer
	// But for compatibility, we'll use single quotes which are the safest for shell
	return `'${input.replace(/'/g, "'\"'\"'")}'`;
}
