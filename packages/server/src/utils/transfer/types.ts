export type ServiceType =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis";

export interface FileInfo {
	path: string;
	size: number;
	modifiedAt: number;
	hash?: string;
}

export type ConflictStatus =
	| "missing_target"
	| "newer_source"
	| "newer_target"
	| "conflict"
	| "match";

export interface FileConflict {
	path: string;
	status: ConflictStatus;
	sourceFile: FileInfo;
	targetFile?: FileInfo;
}

export interface MountTransferConfig {
	mountId: string;
	type: "bind" | "volume" | "file";
	hostPath?: string | null;
	volumeName?: string | null;
	mountPath: string;
	content?: string | null;
	filePath?: string | null;
}

export interface TransferScanResult {
	serviceDirectory: {
		files: FileConflict[];
		totalSize: number;
	};
	traefikConfig: {
		exists: boolean;
		hasConflict: boolean;
	};
	mounts: Array<{
		mount: MountTransferConfig;
		files: FileConflict[];
		totalSize: number;
	}>;
	totalTransferSize: number;
	totalFiles: number;
	conflicts: FileConflict[];
}

export type ConflictDecision = "skip" | "overwrite";

export interface TransferProgress {
	phase:
		| "preparing"
		| "syncing_directory"
		| "syncing_traefik"
		| "syncing_mounts"
		| "updating_database"
		| "completed"
		| "failed";
	currentFile?: string;
	processedFiles: number;
	totalFiles: number;
	transferredBytes: number;
	totalBytes: number;
	percentage: number;
	message?: string;
}

export interface TransferOptions {
	serviceId: string;
	serviceType: ServiceType;
	appName: string;
	sourceServerId: string | null;
	targetServerId: string;
}

export interface TransferResult {
	success: boolean;
	errors: string[];
}
