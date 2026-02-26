/** Human-readable labels for S3 storage classes (see https://rclone.org/s3/#s3-storage-class) */
export const S3_STORAGE_CLASS_LABELS: Record<string, string> = {
	STANDARD: "Standard",
	REDUCED_REDUNDANCY: "Reduced Redundancy",
	STANDARD_IA: "Standard Infrequent Access",
	ONEZONE_IA: "One Zone Infrequent Access",
	GLACIER: "Glacier Flexible Retrieval",
	DEEP_ARCHIVE: "Glacier Deep Archive",
	INTELLIGENT_TIERING: "Intelligent-Tiering",
	GLACIER_IR: "Glacier Instant Retrieval",
};

export const S3_PROVIDER_STORAGE_CLASS_OPTIONS: Record<string, string[]> = {
	AWS: [
		"STANDARD",
		"REDUCED_REDUNDANCY",
		"STANDARD_IA",
		"ONEZONE_IA",
		"GLACIER",
		"DEEP_ARCHIVE",
		"INTELLIGENT_TIERING",
		"GLACIER_IR",
	],
	Alibaba: ["STANDARD", "GLACIER", "STANDARD_IA"],
	ArvanCloud: ["STANDARD"],
	ChinaMobile: ["STANDARD", "GLACIER", "STANDARD_IA"],
	Liara: ["STANDARD"],
	Magalu: ["STANDARD", "GLACIER_IR"],
	Qiniu: ["STANDARD", "GLACIER", "LINE", "DEEP_ARCHIVE"],
	Scaleway: ["STANDARD", "GLACIER", "ONEZONE_IA"],
	TencentCOS: ["STANDARD", "STANDARD_IA", "ARCHIVE"],
};

export const getS3StorageClassOptionsByProvider = (provider?: string | null) => {
	if (!provider) {
		return [];
	}

	return S3_PROVIDER_STORAGE_CLASS_OPTIONS[provider] ?? [];
};

export const getS3StorageClassLabel = (value: string): string =>
	S3_STORAGE_CLASS_LABELS[value] ?? value;
