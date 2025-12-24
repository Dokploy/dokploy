/**
 * Structured error types for better error handling and recovery
 */

export enum ErrorCategory {
	NETWORK = "network",
	FILESYSTEM = "filesystem",
	DATABASE = "database",
	AUTHENTICATION = "authentication",
	VALIDATION = "validation",
	RESOURCE = "resource",
	DEPLOYMENT = "deployment",
	MOUNT = "mount",
	UNKNOWN = "unknown",
}

export enum ErrorSeverity {
	LOW = "low",
	MEDIUM = "medium",
	HIGH = "high",
	CRITICAL = "critical",
}

export interface RecoverySuggestion {
	action: string;
	description: string;
	command?: string;
}

export interface StructuredErrorDetails {
	category: ErrorCategory;
	severity: ErrorSeverity;
	code?: string;
	recoverable: boolean;
	suggestions?: RecoverySuggestion[];
	context?: Record<string, unknown>;
	retryable?: boolean;
	maxRetries?: number;
}

export class StructuredError extends Error {
	public readonly category: ErrorCategory;
	public readonly severity: ErrorSeverity;
	public readonly code?: string;
	public readonly recoverable: boolean;
	public readonly suggestions?: RecoverySuggestion[];
	public readonly context?: Record<string, unknown>;
	public readonly retryable: boolean;
	public readonly maxRetries: number;

	constructor(
		message: string,
		details: StructuredErrorDetails,
	) {
		super(message);
		this.name = "StructuredError";
		this.category = details.category;
		this.severity = details.severity;
		this.code = details.code;
		this.recoverable = details.recoverable;
		this.suggestions = details.suggestions;
		this.context = details.context;
		this.retryable = details.retryable ?? false;
		this.maxRetries = details.maxRetries ?? 3;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, StructuredError);
		}
	}

	/**
	 * Get user-friendly error message with recovery suggestions
	 */
	getUserMessage(): string {
		let message = this.message;

		if (this.suggestions && this.suggestions.length > 0) {
			message += "\n\nRecovery suggestions:";
			this.suggestions.forEach((suggestion, index) => {
				message += `\n${index + 1}. ${suggestion.action}: ${suggestion.description}`;
			});
		}

		return message;
	}

	/**
	 * Check if error can be retried
	 */
	canRetry(attempts: number): boolean {
		return this.retryable && attempts < this.maxRetries;
	}
}

/**
 * Create a mount-related error with recovery suggestions
 */
export const createMountError = (
	message: string,
	context?: Record<string, unknown>,
): StructuredError => {
	const suggestions: RecoverySuggestion[] = [];

	// Add context-specific suggestions
	if (context?.mountType === "nfs") {
		suggestions.push({
			action: "Verify NFS server connectivity",
			description: "Check if the NFS server is accessible and the export is available",
			command: `ping -c 3 ${context.nfsServer || "NFS_SERVER"}`,
		});
		suggestions.push({
			action: "Check NFS service status",
			description: "Ensure NFS services are running on the server",
			command: "systemctl status nfs-server",
		});
	}

	if (context?.mountType === "smb") {
		suggestions.push({
			action: "Verify SMB server connectivity",
			description: "Check if the SMB server is accessible",
			command: `ping -c 3 ${context.smbServer || "SMB_SERVER"}`,
		});
		suggestions.push({
			action: "Check credentials",
			description: "Verify username, password, and domain are correct",
		});
	}

	if (context?.nodeId) {
		suggestions.push({
			action: "Check node connectivity",
			description: "Verify the swarm node is accessible and in the swarm",
			command: `docker node inspect ${context.nodeId}`,
		});
	}

	return new StructuredError(message, {
		category: ErrorCategory.MOUNT,
		severity: ErrorSeverity.MEDIUM,
		code: "MOUNT_ERROR",
		recoverable: true,
		suggestions,
		context,
		retryable: true,
		maxRetries: 3,
	});
};

/**
 * Create a network error with recovery suggestions
 */
export const createNetworkError = (
	message: string,
	context?: Record<string, unknown>,
): StructuredError => {
	return new StructuredError(message, {
		category: ErrorCategory.NETWORK,
		severity: ErrorSeverity.HIGH,
		code: "NETWORK_ERROR",
		recoverable: true,
		suggestions: [
			{
				action: "Check network connectivity",
				description: "Verify network connection and firewall rules",
			},
			{
				action: "Retry operation",
				description: "Network issues are often temporary",
			},
		],
		context,
		retryable: true,
		maxRetries: 5,
	});
};

/**
 * Create a filesystem error with recovery suggestions
 */
export const createFilesystemError = (
	message: string,
	context?: Record<string, unknown>,
): StructuredError => {
	const suggestions: RecoverySuggestion[] = [
		{
			action: "Check disk space",
			description: "Verify sufficient disk space is available",
			command: "df -h",
		},
		{
			action: "Check permissions",
			description: "Verify file/directory permissions are correct",
			command: `ls -la ${context?.path || "PATH"}`,
		},
	];

	return new StructuredError(message, {
		category: ErrorCategory.FILESYSTEM,
		severity: ErrorSeverity.MEDIUM,
		code: "FILESYSTEM_ERROR",
		recoverable: true,
		suggestions,
		context,
		retryable: false,
	});
};

