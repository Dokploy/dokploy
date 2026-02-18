/**
 * Transfer types for service migration between nodes
 */

// Service types matching the mount schema
export type ServiceType =
	| "application"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "compose";

// File information for comparison
export interface FileInfo {
	path: string;
	size: number;
	mtime: number; // Unix timestamp
	mode: string; // Permission string like "0644"
	hash?: string; // MD5 or SHA256, computed on demand
	isDirectory: boolean;
}

// Comparison result for a single file
export type FileCompareStatus =
	| "match" // Identical on both
	| "missing_target" // Only on source
	| "missing_source" // Only on target
	| "newer_source" // Source is newer
	| "newer_target" // Target is newer
	| "conflict"; // Different but same mtime

export interface FileCompareResult extends FileInfo {
	status: FileCompareStatus;
	targetInfo?: FileInfo;
	decisionKey?: string; // Scoped key for manual conflict decisions
}

// Merge strategies for handling existing files
export type MergeStrategy =
	| "skip" // Keep target, copy missing only
	| "overwrite" // Source always wins
	| "newer" // Compare mtime, newer wins
	| "manual"; // User decides per file

// Mount transfer configuration
export interface MountTransferConfig {
	mountId: string;
	mountType: "volume" | "bind" | "file";
	sourcePath: string; // Volume name or host path
	targetPath: string; // Can be different for bind mounts
	createIfMissing: boolean;
	updateMountConfig: boolean; // Update DB after transfer
}

// Pre-flight check result
export interface PreflightCheckResult {
	path: string;
	exists: boolean;
	writable: boolean;
	error?: string;
	spaceAvailable?: number; // Bytes
}

// Overall transfer status
export type TransferState =
	| "idle"
	| "scanning"
	| "comparing"
	| "ready"
	| "syncing"
	| "paused"
	| "completed"
	| "error"
	| "cancelled";

// Real-time transfer status for WebSocket updates
export interface TransferStatus {
	state: TransferState;
	totalFiles: number;
	processedFiles: number;
	totalBytes: number;
	transferredBytes: number;
	currentFile?: string;
	speed?: number; // Bytes per second
	eta?: number; // Seconds remaining
	errors: string[];
}

// Transfer job for a single mount
export interface MountTransferJob {
	config: MountTransferConfig;
	files: FileCompareResult[];
	status: "pending" | "scanning" | "syncing" | "done" | "error";
	error?: string;
}

// Full transfer configuration
export interface TransferConfig {
	serviceId: string;
	serviceType: ServiceType;
	sourceServerId: string | null; // null for local/main server
	targetServerId: string;
	mergeStrategy: MergeStrategy;
	mounts: MountTransferConfig[];
	manualDecisions?: Record<string, "skip" | "overwrite">; // decisionKey -> decision
}

// WebSocket message types
export type TransferMessageType =
	| "scan_start"
	| "scan_progress"
	| "scan_complete"
	| "compare_start"
	| "compare_progress"
	| "compare_complete"
	| "sync_start"
	| "sync_progress"
	| "sync_file"
	| "sync_complete"
	| "error"
	| "paused"
	| "resumed"
	| "cancelled";

export interface TransferMessage {
	type: TransferMessageType;
	payload: unknown;
	timestamp: number;
}

// WebSocket command from client
export type TransferCommand =
	| { action: "scan"; config: TransferConfig }
	| { action: "compare" }
	| { action: "sync"; manualDecisions?: Record<string, "skip" | "overwrite"> }
	| { action: "pause" }
	| { action: "resume" }
	| { action: "cancel" };
