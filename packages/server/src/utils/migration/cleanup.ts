import { removeVolume } from "@dokploy/server/services/docker-volume";
import { removeService } from "@dokploy/server/utils/docker/utils";

/**
 * Recognizes the "this resource is already gone" family of Docker error
 * messages (volume/service/container/network/stack). Cleanup steps are run
 * against whatever the source/target happens to look like right now, which
 * may already match the desired end state - either because a previous
 * attempt at the same cleanup partially succeeded (finalize/rollback must be
 * safely retryable) or because the resource was never created in the first
 * place. In every one of those cases, "already absent" must be treated as
 * success; only a genuine removal failure should be surfaced as an error.
 */
export const isMissingResourceError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error ?? "");
	return /no such (volume|container|service|network|image)|(?:volume|container|service|network|image|stack).+not found|nothing found in stack/i.test(
		message,
	);
};

/**
 * Removes a Docker volume, treating "already removed" as success. Real
 * removal failures (in use, permission, daemon unreachable, ...) are
 * rethrown - callers must not swallow those, or a finalize/rollback step
 * could be marked complete while source or target data is still stranded.
 */
export const removeVolumeIdempotent = async (
	volumeName: string,
	serverId: string | null,
): Promise<void> => {
	try {
		await removeVolume(volumeName, serverId ?? undefined);
	} catch (error) {
		if (isMissingResourceError(error)) return;
		throw error;
	}
};

/**
 * Removes a Docker service, treating "already removed" as success.
 * `removeService` reports failures via its return value rather than
 * throwing, so callers that used to check only truthiness could otherwise
 * fail to distinguish "already gone" (fine) from a real error (must not be
 * swallowed).
 */
export const removeServiceIdempotent = async (
	appName: string,
	serverId: string | null,
): Promise<void> => {
	const error = await removeService(appName, serverId ?? undefined);
	if (!error) return;
	if (isMissingResourceError(error)) return;
	throw error instanceof Error ? error : new Error(String(error));
};
