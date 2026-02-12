/**
 * Security validation utilities for input sanitization and path validation
 */

/**
 * Validates and sanitizes file paths to prevent directory traversal attacks
 */
export const validatePath = (path: string, allowAbsolute = false): string => {
	if (!path || typeof path !== "string") {
		throw new Error("Path must be a non-empty string");
	}

	// Remove null bytes
	let sanitized = path.replace(/\0/g, "");

	// Check for directory traversal attempts
	if (
		sanitized.includes("..") ||
		sanitized.includes("//") ||
		sanitized.includes("\\\\")
	) {
		throw new Error("Path contains invalid characters (directory traversal attempt)");
	}

	// If absolute paths are not allowed, ensure it's relative
	if (!allowAbsolute && sanitized.startsWith("/")) {
		throw new Error("Absolute paths are not allowed");
	}

	// Trim whitespace
	sanitized = sanitized.trim();

	// Ensure path doesn't end with a slash (except root)
	if (sanitized.length > 1 && sanitized.endsWith("/")) {
		sanitized = sanitized.slice(0, -1);
	}

	return sanitized;
};

/**
 * Validates mount path (must be absolute and not contain dangerous patterns)
 */
export const validateMountPath = (path: string): string => {
	if (!path || typeof path !== "string") {
		throw new Error("Mount path must be a non-empty string");
	}

	// Must be absolute
	if (!path.startsWith("/")) {
		throw new Error("Mount path must be absolute (start with /)");
	}

	// Validate using general path validation
	const sanitized = validatePath(path, true);

	// Additional checks for mount paths
	if (sanitized.length === 0 || sanitized === "/") {
		throw new Error("Mount path cannot be root");
	}

	// Check for dangerous mount points
	const dangerousPaths = [
		"/etc",
		"/bin",
		"/sbin",
		"/usr/bin",
		"/usr/sbin",
		"/lib",
		"/lib64",
		"/sys",
		"/proc",
		"/dev",
		"/boot",
		"/root",
	];

	for (const dangerous of dangerousPaths) {
		if (sanitized === dangerous || sanitized.startsWith(`${dangerous}/`)) {
			throw new Error(`Mount path cannot be ${dangerous} or its subdirectories`);
		}
	}

	return sanitized;
};

/**
 * Validates NFS server address (IP or hostname)
 */
export const validateNFSServer = (server: string): string => {
	if (!server || typeof server !== "string") {
		throw new Error("NFS server must be a non-empty string");
	}

	const sanitized = server.trim();

	// Basic validation for IP or hostname
	const ipRegex =
		/^(\d{1,3}\.){3}\d{1,3}$/;
	const hostnameRegex =
		/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

	if (!ipRegex.test(sanitized) && !hostnameRegex.test(sanitized)) {
		throw new Error("NFS server must be a valid IP address or hostname");
	}

	// Validate IP address ranges if it's an IP
	if (ipRegex.test(sanitized)) {
		const parts = sanitized.split(".").map(Number);
		if (parts.some((part) => part < 0 || part > 255)) {
			throw new Error("NFS server IP address contains invalid octets");
		}
	}

	return sanitized;
};

/**
 * Validates SMB server address (IP or hostname)
 */
export const validateSMBServer = (server: string): string => {
	// Same validation as NFS server
	return validateNFSServer(server);
};

/**
 * Validates NFS export path
 */
export const validateNFSPath = (path: string): string => {
	if (!path || typeof path !== "string") {
		throw new Error("NFS path must be a non-empty string");
	}

	// Must be absolute
	if (!path.startsWith("/")) {
		throw new Error("NFS path must be absolute (start with /)");
	}

	// Validate using general path validation
	return validatePath(path, true);
};

/**
 * Validates SMB share name
 */
export const validateSMBShare = (share: string): string => {
	if (!share || typeof share !== "string") {
		throw new Error("SMB share name must be a non-empty string");
	}

	const sanitized = share.trim();

	// SMB share names have restrictions
	if (sanitized.length === 0 || sanitized.length > 80) {
		throw new Error("SMB share name must be between 1 and 80 characters");
	}

	// Check for invalid characters
	if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
		throw new Error(
			"SMB share name can only contain letters, numbers, underscores, and hyphens",
		);
	}

	return sanitized;
};

/**
 * Validates SMB subdirectory path
 */
export const validateSMBPath = (path: string): string => {
	if (!path) {
		return "";
	}

	if (typeof path !== "string") {
		throw new Error("SMB path must be a string");
	}

	// Must start with /
	if (!path.startsWith("/")) {
		throw new Error("SMB path must start with /");
	}

	// Validate using general path validation
	return validatePath(path, true);
};

/**
 * Sanitizes username to prevent injection attacks
 */
export const sanitizeUsername = (username: string): string => {
	if (!username || typeof username !== "string") {
		throw new Error("Username must be a non-empty string");
	}

	// Remove null bytes and control characters
	let sanitized = username.replace(/[\0\x00-\x1F\x7F]/g, "");

	// Trim whitespace
	sanitized = sanitized.trim();

	// Check length
	if (sanitized.length === 0 || sanitized.length > 255) {
		throw new Error("Username must be between 1 and 255 characters");
	}

	return sanitized;
};

/**
 * Validates mount options string
 */
export const validateMountOptions = (options: string | undefined): string | undefined => {
	if (!options) {
		return undefined;
	}

	if (typeof options !== "string") {
		throw new Error("Mount options must be a string");
	}

	const sanitized = options.trim();

	// Check for dangerous options that could be used for injection
	const dangerousOptions = ["exec", "suid", "dev", "nosuid", "nodev", "noexec"];

	// Allow these but log a warning
	for (const dangerous of dangerousOptions) {
		if (sanitized.includes(dangerous)) {
			console.warn(
				`Mount option "${dangerous}" detected. Ensure this is intentional.`,
			);
		}
	}

	// Remove null bytes
	return sanitized.replace(/\0/g, "");
};

/**
 * Validates Docker Swarm node ID
 */
export const validateNodeId = (nodeId: string): string => {
	if (!nodeId || typeof nodeId !== "string") {
		throw new Error("Node ID must be a non-empty string");
	}

	const sanitized = nodeId.trim();

	// Docker node IDs are typically 64 character hex strings
	if (!/^[a-f0-9]{64}$/i.test(sanitized)) {
		throw new Error("Invalid Docker Swarm node ID format");
	}

	return sanitized;
};

