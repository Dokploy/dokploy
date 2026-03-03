import { findDestinationById } from "@dokploy/server/services/destination";
import { TRPCError } from "@trpc/server";

const PROVIDER_STORAGE_CLASS_OPTIONS = {
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

	// Other providers can be added in the future
	//
	// Alibaba: ["STANDARD", "GLACIER", "STANDARD_IA"],
	// ArvanCloud: ["STANDARD"],
	// ChinaMobile: ["STANDARD", "GLACIER", "STANDARD_IA"],
	// Liara: ["STANDARD"],
	// Magalu: ["STANDARD", "GLACIER_IR"],
	// Qiniu: ["STANDARD", "GLACIER", "LINE", "DEEP_ARCHIVE"],
	// Scaleway: ["STANDARD", "GLACIER", "ONEZONE_IA"],
	// TencentCOS: ["STANDARD", "STANDARD_IA", "ARCHIVE"],
} as const satisfies Record<string, readonly string[]>;

export const S3_PROVIDER_STORAGE_CLASS_OPTIONS: Readonly<
	Record<string, readonly string[]>
> = PROVIDER_STORAGE_CLASS_OPTIONS;

export const normalizeS3StorageClass = (storageClass?: string | null) => {
	const normalized = storageClass?.trim();
	return normalized ? normalized.toUpperCase() : undefined;
};

export const getS3StorageClassesForProvider = (provider?: string | null) => {
	if (!provider) {
		return [];
	}

	return S3_PROVIDER_STORAGE_CLASS_OPTIONS[provider] ?? [];
};

export const isValidS3StorageClassForProvider = ({
	provider,
	storageClass,
}: {
	provider?: string | null;
	storageClass?: string | null;
}) => {
	const normalizedStorageClass = normalizeS3StorageClass(storageClass);
	if (!normalizedStorageClass) {
		return true;
	}

	const providerStorageClasses = getS3StorageClassesForProvider(provider);
	if (providerStorageClasses.length === 0) {
		return false;
	}

	return providerStorageClasses.includes(normalizedStorageClass);
};

export const validateS3StorageClassForDestination = async ({
	destinationId,
	storageClass,
}: {
	destinationId: string;
	storageClass?: string | null;
}) => {
	const normalizedStorageClass = normalizeS3StorageClass(storageClass);
	if (!normalizedStorageClass) {
		return;
	}

	const destination = await findDestinationById(destinationId);
	const provider = destination.provider;
	const supportedStorageClasses = getS3StorageClassesForProvider(provider);

	if (supportedStorageClasses.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Storage class is not supported for provider "${provider || "Unknown"}".`,
		});
	}

	if (!supportedStorageClasses.includes(normalizedStorageClass)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid storage class for provider "${provider}". Allowed values: ${supportedStorageClasses.join(", ")}.`,
		});
	}
};
