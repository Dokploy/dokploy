import { rewriteVolumeName } from "./appname";
import type { ProjectTree } from "./queries";
import {
	SERVICE_ID_FIELD,
	scopedServices,
	serviceDisplayName,
} from "./service-kinds";
import type { ExportScope, ServiceType, UsedBy, Warning } from "./types";
import { isPinnedImage } from "./versions";

const volumeNameSurvivesUnchanged = (
	volumeName: string,
	appName: unknown,
): boolean =>
	typeof appName !== "string" ||
	appName.length === 0 ||
	!rewriteVolumeName(volumeName, { [appName]: "x" }).rewritten;

const IMAGE_SERVICE_TYPES = new Set<ServiceType>([
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
]);

export const exportedImageOf = (
	serviceType: ServiceType,
	service: Record<string, unknown>,
): string | undefined => {
	if (
		IMAGE_SERVICE_TYPES.has(serviceType) ||
		(serviceType === "application" && service.sourceType === "docker")
	) {
		const image = service.dockerImage;
		return typeof image === "string" && image.length > 0 ? image : undefined;
	}
	return undefined;
};

export const detectWarnings = (
	tree: ProjectTree,
	scope: ExportScope,
): Warning[] => {
	const warnings: Warning[] = [];

	for (const { serviceType, environmentId, service } of scopedServices(
		tree,
		scope,
	)) {
		const serviceId = service[SERVICE_ID_FIELD[serviceType]] as string;
		const baseUsedBy: UsedBy = {
			serviceId,
			serviceType,
			serviceName: serviceDisplayName(service),
			environmentId,
		};

		const mounts =
			(service.mounts as Record<string, unknown>[] | undefined) ?? [];
		for (const mount of mounts) {
			const field = `mount:${mount.mountId}`;
			if (
				mount.type === "bind" &&
				typeof mount.hostPath === "string" &&
				mount.hostPath.startsWith("/")
			) {
				warnings.push({
					code: "ABSOLUTE_HOST_PATH_MOUNT",
					severity: "warning",
					message: `Mount "${mount.mountPath}" uses the absolute host path "${mount.hostPath}", which won't exist on the destination server.`,
					affected: [{ ...baseUsedBy, field }],
				});
			}
			if (
				mount.type === "volume" &&
				typeof mount.volumeName === "string" &&
				mount.volumeName.length > 0 &&
				volumeNameSurvivesUnchanged(mount.volumeName, service.appName)
			) {
				warnings.push({
					code: "MANUAL_VOLUME_NAME",
					severity: "warning",
					message: `Mount "${mount.mountPath}" has a volume name ("${mount.volumeName}") that doesn't reference this service's appName, so it won't be renamed on import and can collide with an existing volume on the destination.`,
					affected: [{ ...baseUsedBy, field }],
				});
			}
		}

		if (
			serviceType === "compose" &&
			typeof service.composeFile === "string" &&
			typeof service.appName === "string" &&
			service.appName.length > 0 &&
			service.composeFile.includes(service.appName)
		) {
			warnings.push({
				code: "APPNAME_IN_COMPOSE_FILE",
				severity: "warning",
				message:
					"The compose file references its own appName in free text (labels, network names, etc.); it won't be rewritten automatically on import.",
				affected: [baseUsedBy],
			});
		}

		if (serviceType === "application" && service.isPreviewDeploymentsActive) {
			warnings.push({
				code: "PREVIEW_DEPLOYMENTS_DROPPED",
				severity: "info",
				message:
					"This application has preview deployments enabled; existing preview deployments are not exported.",
				affected: [baseUsedBy],
			});
		}

		if (
			serviceType === "application" &&
			service.sourceType === "drop" &&
			!scope.files.applicationSources
		) {
			warnings.push({
				code: "DROP_SOURCE_NOT_EXPORTED",
				severity: "warning",
				message:
					'This application\'s source code only exists on disk ("drop" source) and application sources are excluded from this export; the imported service will have nothing to build.',
				affected: [baseUsedBy],
			});
		}

		const domains =
			(service.domains as Record<string, unknown>[] | undefined) ?? [];
		for (const domain of domains) {
			if (domain.certificateType === "letsencrypt") {
				warnings.push({
					code: "LETSENCRYPT_CERTS_NOT_EXPORTED",
					severity: "info",
					message: `Domain "${domain.host}" uses a Let's Encrypt certificate, which is re-issued on the destination instead of being exported.`,
					affected: [{ ...baseUsedBy, field: `domain:${domain.domainId}` }],
				});
			}
		}

		const image = exportedImageOf(serviceType, service);
		if (image && !isPinnedImage(image)) {
			warnings.push({
				code: "IMAGE_TAG_NOT_PINNED",
				severity: "warning",
				message: `Image "${image}" has no fixed tag; the destination will pull whatever "latest" is at import time, which may be a different version than what runs here.`,
				affected: [baseUsedBy],
			});
		}

		if (serviceType === "redis") {
			warnings.push({
				code: "REDIS_NO_DUMP",
				severity: "info",
				message:
					"Redis has no dump/restore mechanism; this service is exported as config only, without its data.",
				affected: [baseUsedBy],
			});
		}

		if (
			(serviceType === "application" || serviceType === "compose") &&
			service.autoDeploy
		) {
			warnings.push({
				code: "WEBHOOK_TOKEN_REGENERATED",
				severity: "info",
				message:
					"This service has auto-deploy enabled; its webhook token is never exported and will be regenerated on import.",
				affected: [baseUsedBy],
			});
		}
	}

	return warnings;
};
