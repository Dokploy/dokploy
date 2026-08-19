import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";

export interface DockerImage {
	Repository: string;
	Tag: string;
	ID: string;
	Digest?: string;
	CreatedAt: string;
	CreatedSince: string;
	Size: string;
	SharedSize?: string;
	UniqueSize?: string;
	VirtualSize?: string;
}

export type ImageVersionStatus = "outdated" | "up_to_date" | "unknown";

export interface ImageOutdatedStatus {
	reference: string;
	status: ImageVersionStatus;
	localDigest: string | null;
	remoteDigest: string | null;
	reason?: string;
}

interface LocalImageInfo {
	id: string;
	digests: string[];
}

const STATUS_CHECK_CONCURRENCY = 5;

const runDockerCommand = async (command: string, serverId?: string) => {
	return serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);
};

const extractDigest = (value?: string | null) => {
	if (!value) return null;
	const match = value.match(/sha256:[a-fA-F0-9]{64}/);
	return match?.[0] ?? null;
};

const collectDigests = (values: Array<string | null | undefined>) => {
	const digests = new Set<string>();
	for (const value of values) {
		const digest = extractDigest(value);
		if (digest) {
			digests.add(digest);
		}
	}
	return [...digests];
};

const getLocalImageInfo = async (
	reference: string,
	serverId?: string,
): Promise<LocalImageInfo> => {
	const command = `docker image inspect ${quote([reference])} --format '{{json .}}'`;
	const { stdout } = await runDockerCommand(command, serverId);
	const parsed = JSON.parse(stdout.trim()) as {
		Id?: string;
		RepoDigests?: string[];
	};

	return {
		id: parsed.Id ?? "",
		digests: collectDigests(parsed.RepoDigests ?? []),
	};
};

const remoteDigestCache = new Map<
	string,
	{ digests: string[]; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours in milliseconds

const getRemoteDigestCacheKey = (reference: string, serverId?: string) =>
	`${serverId ?? "local"}-${reference}`;

const pruneExpiredRemoteDigestCache = (now: number) => {
	for (const [key, entry] of remoteDigestCache) {
		if (now - entry.timestamp >= CACHE_TTL) {
			remoteDigestCache.delete(key);
		}
	}
};

export const invalidateRemoteDigestCache = (
	reference: string,
	serverId?: string,
) => {
	remoteDigestCache.delete(getRemoteDigestCacheKey(reference, serverId));
};

const getRemoteDigestCandidates = async (
	reference: string,
	serverId?: string,
): Promise<string[]> => {
	const now = Date.now();
	pruneExpiredRemoteDigestCache(now);

	const cacheKey = getRemoteDigestCacheKey(reference, serverId);
	const cached = remoteDigestCache.get(cacheKey);

	if (cached && now - cached.timestamp < CACHE_TTL) {
		return cached.digests;
	}

	const command = `docker buildx imagetools inspect ${quote([reference])}`;
	const { stdout } = await runDockerCommand(command, serverId);

	const candidates = new Set<string>();
	const lines = stdout.split("\n");

	for (const line of lines) {
		if (line.trim().startsWith("Digest:")) {
			const digest = extractDigest(line);
			if (digest) candidates.add(digest);
		}
		if (line.includes("sha256:")) {
			const digest = extractDigest(line);
			if (digest) candidates.add(digest);
		}
	}

	const results = [...candidates];

	if (results.length > 0) {
		remoteDigestCache.set(cacheKey, {
			digests: results,
			timestamp: Date.now(),
		});
	}

	return results;
};

const mapWithConcurrency = async <T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
) => {
	if (items.length === 0) return [] as R[];
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	const workers = Array.from({
		length: Math.min(concurrency, items.length),
	}).map(async () => {
		while (true) {
			const current = nextIndex;
			nextIndex += 1;
			if (current >= items.length) return;
			results[current] = await mapper(items[current] as T, current);
		}
	});

	await Promise.all(workers);
	return results;
};

const buildOutdatedStatus = async (
	reference: string,
	serverId?: string,
): Promise<ImageOutdatedStatus> => {
	try {
		const local = await getLocalImageInfo(reference, serverId);
		if (!local.id && local.digests.length === 0) {
			return {
				reference,
				status: "unknown",
				localDigest: null,
				remoteDigest: null,
				reason: "No local image data found",
			};
		}

		let remoteCandidates: string[];
		try {
			remoteCandidates = await getRemoteDigestCandidates(reference, serverId);
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Lookup failed";
			const isRateLimit =
				msg.toLowerCase().includes("toomanyrequests") ||
				msg.toLowerCase().includes("rate limit");
			return {
				reference,
				status: "unknown",
				localDigest: local.digests[0] ?? local.id,
				remoteDigest: null,
				reason: isRateLimit
					? "Registry rate limited"
					: "Registry lookup failed",
			};
		}

		if (remoteCandidates.length === 0) {
			return {
				reference,
				status: "unknown",
				localDigest: local.digests[0] ?? local.id,
				remoteDigest: null,
				reason: "No remote digest found",
			};
		}

		const localSet = new Set([local.id, ...local.digests]);

		// Try to find a direct match
		const match = remoteCandidates.find((candidate) => localSet.has(candidate));

		if (match) {
			return {
				reference,
				status: "up_to_date",
				localDigest: match,
				remoteDigest: match,
			};
		}

		// If no match is found, it means the local digests are completely different
		// from what is currently on the remote registry. The image is outdated.
		return {
			reference,
			status: "outdated",
			localDigest: local.digests[0] ?? local.id,
			// Return the first digest (which is the Index digest we hashed)
			remoteDigest: remoteCandidates[0] ?? null,
			reason: "Digest differs",
		};
	} catch (error) {
		return {
			reference,
			status: "unknown",
			localDigest: null,
			remoteDigest: null,
			reason: error instanceof Error ? error.message : "Unknown error",
		};
	}
};

export const getImages = async (serverId?: string) => {
	try {
		const command = "docker images --format '{{json .}}'";
		const { stdout } = await runDockerCommand(command, serverId);

		return stdout
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as DockerImage);
	} catch (error) {
		console.error(error);
		return [];
	}
};

export const getImagesOutdatedStatus = async (
	references: string[],
	serverId?: string,
) => {
	const uniqueReferences = [...new Set(references.filter(Boolean))];

	const statusEntries = await mapWithConcurrency(
		uniqueReferences,
		STATUS_CHECK_CONCURRENCY,
		(reference) => buildOutdatedStatus(reference, serverId),
	);

	return statusEntries;
};

export const getImageConfig = async (imageRef: string, serverId?: string) => {
	const command = `docker image inspect ${quote([String(imageRef ?? "")])}`;
	const { stdout } = await runDockerCommand(command, serverId);

	return JSON.parse(stdout.trim())[0];
};

interface RemoveImageParams {
	repository: string;
	tag: string;
	id: string;
	force?: boolean;
}

export const removeImage = async (
	{ repository, tag, id, force }: RemoveImageParams,
	serverId?: string,
) => {
	const hasTaggedReference =
		repository && tag && repository !== "<none>" && tag !== "<none>";
	const reference = hasTaggedReference ? `${repository}:${tag}` : id;
	const command = `docker rmi ${force ? "-f " : ""}${quote([String(reference ?? "")])}`;

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};
