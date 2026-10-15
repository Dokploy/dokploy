import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import semver from "semver";
import type { ProjectTree } from "./queries";
import { scopedServices } from "./service-kinds";
import type { ExportScope, SourceInstance, Warning } from "./types";

export type InstanceVersions = {
	dokployVersion: string;
	releaseTag: string;
	isCloud: boolean;
	traefikVersion: string;
	nodeVersion: string;
};

const LOCAL_SERVER_KEY = "local";

export const isPinnedImage = (image: string): boolean => {
	if (image.includes("@sha256:")) return true;
	const lastSlash = image.lastIndexOf("/");
	const tagIndex = image.lastIndexOf(":");
	if (tagIndex <= lastSlash) return false;
	const tag = image.slice(tagIndex + 1);
	return tag.length > 0 && tag !== "latest";
};

export type RunVersionProbe = (
	serverId: string | null,
	command: string,
) => Promise<string>;

const defaultProbe: RunVersionProbe = async (serverId, command) => {
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);
	return stdout.trim();
};

const DOCKER_VERSION_COMMAND = "docker version --format '{{.Server.Version}}'";

export const collectDockerVersions = async (
	tree: ProjectTree,
	scope: ExportScope,
	probe: RunVersionProbe = defaultProbe,
): Promise<Record<string, string>> => {
	const serverIds = new Set<string | null>();
	for (const { service } of scopedServices(tree, scope)) {
		serverIds.add((service.serverId as string | null) ?? null);
	}
	const versions: Record<string, string> = {};
	for (const serverId of serverIds) {
		try {
			const version = await probe(serverId, DOCKER_VERSION_COMMAND);
			if (version) versions[serverId ?? LOCAL_SERVER_KEY] = version;
		} catch {}
	}
	return versions;
};

export const probeDockerVersion = (
	serverId: string | null,
	probe: RunVersionProbe = defaultProbe,
): Promise<string> => probe(serverId, DOCKER_VERSION_COMMAND);

const instanceWarning = (
	code: Warning["code"],
	severity: Warning["severity"],
	message: string,
): Warning => ({ code, severity, message, affected: [] });

export const compareInstanceVersions = (
	source: SourceInstance,
	destination: InstanceVersions,
): Warning[] => {
	const warnings: Warning[] = [];

	const sourceVersion = semver.coerce(source.dokployVersion);
	const destVersion = semver.coerce(destination.dokployVersion);
	if (sourceVersion && destVersion) {
		if (semver.gt(sourceVersion, destVersion)) {
			warnings.push(
				instanceWarning(
					"DOKPLOY_VERSION_MISMATCH",
					"warning",
					`This bundle was exported from Dokploy ${source.dokployVersion}, newer than this instance (${destination.dokployVersion}). Fields this version doesn't know about will be dropped silently; upgrade before importing to be safe.`,
				),
			);
		} else if (semver.lt(sourceVersion, destVersion)) {
			warnings.push(
				instanceWarning(
					"DOKPLOY_VERSION_MISMATCH",
					"info",
					`This bundle was exported from Dokploy ${source.dokployVersion}; this instance runs ${destination.dokployVersion}. Defaults added since then will apply to the imported services.`,
				),
			);
		}
	} else if (source.dokployVersion !== destination.dokployVersion) {
		warnings.push(
			instanceWarning(
				"DOKPLOY_VERSION_MISMATCH",
				"info",
				`Exported from Dokploy "${source.dokployVersion}" (${source.releaseTag ?? "unknown tag"}); this instance runs "${destination.dokployVersion}" (${destination.releaseTag}). These versions can't be compared automatically.`,
			),
		);
	}

	if (source.isCloud !== undefined && source.isCloud !== destination.isCloud) {
		warnings.push(
			instanceWarning(
				"INSTANCE_KIND_MISMATCH",
				"info",
				source.isCloud
					? "Exported from Dokploy Cloud into a self-hosted instance: every service needs a server assignment (local is now available), and Cloud-only settings don't apply here."
					: "Exported from a self-hosted instance into Dokploy Cloud: services that ran on the local host must be assigned to a remote server.",
			),
		);
	}

	if (
		source.traefikVersion &&
		source.traefikVersion !== destination.traefikVersion
	) {
		warnings.push(
			instanceWarning(
				"TRAEFIK_VERSION_MISMATCH",
				"info",
				`Traefik ${source.traefikVersion} at the source vs ${destination.traefikVersion} here; raw Traefik config copied from the bundle may need adjusting.`,
			),
		);
	}

	return warnings;
};

export const compareDockerVersions = (
	sourceVersion: string | undefined,
	destinationVersion: string,
): string | undefined => {
	if (!sourceVersion) return undefined;
	const source = semver.coerce(sourceVersion);
	const destination = semver.coerce(destinationVersion);
	if (!source || !destination) {
		return sourceVersion === destinationVersion
			? undefined
			: `Docker ${destinationVersion} here, ${sourceVersion} at the source`;
	}
	if (source.major !== destination.major) {
		return `Docker ${destinationVersion} here, ${sourceVersion} at the source (different major version)`;
	}
	return undefined;
};
