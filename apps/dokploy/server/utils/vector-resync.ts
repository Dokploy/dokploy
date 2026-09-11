import {
	findAllServersWithLogManagementEnabled,
	findServersWithLogManagementEnabled,
	getWebServerSettings,
	hasEnabledLogProvider,
	IS_CLOUD,
	loadVectorOrgData,
	removeVectorAgent,
	removeWebVectorAgent,
	syncVectorAgent,
	syncVectorConfig,
	syncWebVectorAgent,
	syncWebVectorConfig,
	updateWebServerSettings,
	VECTOR_RESYNC_CRON_JOB,
	type VectorOrgData,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { scheduledJobs, scheduleJob } from "node-schedule";

export const applyVectorResyncSchedule = async (
	serverId: string,
	enable: boolean,
) => {
	const jobName = `vector-resync:${serverId}`;
	if (IS_CLOUD) {
		console.warn(
			`[Vector] Periodic resync for server ${serverId} is running in-process, not via the Cloud Jobs service (no handler for "vector-resync" yet).`,
		);
	}
	if (enable) {
		scheduleJob(jobName, VECTOR_RESYNC_CRON_JOB, async () => {
			try {
				await syncVectorConfig({ serverId });
			} catch (error) {
				console.error(`[Vector] Resync failed for server ${serverId}:`, error);
				if (error instanceof TRPCError && error.code === "NOT_FOUND") {
					scheduledJobs[jobName]?.cancel();
				}
			}
		});
	} else {
		scheduledJobs[jobName]?.cancel();
	}
};

const WEB_VECTOR_RESYNC_JOB_NAME = "vector-resync-web";

export const applyWebVectorResyncSchedule = async (
	organizationId: string,
	enable: boolean,
) => {
	if (enable) {
		scheduleJob(
			WEB_VECTOR_RESYNC_JOB_NAME,
			VECTOR_RESYNC_CRON_JOB,
			async () => {
				try {
					await syncWebVectorConfig(organizationId);
				} catch (error) {
					console.error("[Vector] Local resync failed:", error);
				}
			},
		);
	} else {
		scheduledJobs[WEB_VECTOR_RESYNC_JOB_NAME]?.cancel();
	}
};

export const initVectorResyncSchedules = async () => {
	let servers: Awaited<
		ReturnType<typeof findAllServersWithLogManagementEnabled>
	>;
	try {
		servers = await findAllServersWithLogManagementEnabled();
	} catch (error) {
		console.error(
			"[Vector] Failed to load servers for resync schedules:",
			error,
		);
		return;
	}
	const hasProviderByOrg = new Map<
		string,
		ReturnType<typeof hasEnabledLogProvider>
	>();
	const hasProviderCached = (organizationId: string) => {
		let result = hasProviderByOrg.get(organizationId);
		if (!result) {
			result = hasEnabledLogProvider(organizationId);
			hasProviderByOrg.set(organizationId, result);
		}
		return result;
	};

	await Promise.all(
		servers.map(async (s) => {
			try {
				if (await hasProviderCached(s.organizationId)) {
					await applyVectorResyncSchedule(s.serverId, true);
				}
			} catch (error) {
				console.error(
					`[Vector] Failed to re-register resync schedule for server ${s.serverId}:`,
					error,
				);
			}
		}),
	);

	if (!IS_CLOUD) {
		try {
			const settings = await getWebServerSettings();
			const organizationId = settings?.logManagementOrganizationId;
			if (
				settings?.enableLogManagement &&
				organizationId &&
				(await hasEnabledLogProvider(organizationId))
			) {
				await applyWebVectorResyncSchedule(organizationId, true);
			}
		} catch (error) {
			console.error(
				"[Vector] Failed to re-register local resync schedule:",
				error,
			);
		}
	}
};

export const syncVectorAgentAndSchedule = async (
	serverId: string,
	preloaded?: VectorOrgData,
) => {
	const { installed } = await syncVectorAgent({ serverId, preloaded });
	await applyVectorResyncSchedule(serverId, installed);
	return { installed };
};

export const syncWebVectorAgentAndSchedule = async (
	organizationId: string,
	preloaded?: VectorOrgData,
) => {
	const { installed } = await syncWebVectorAgent(preloaded);
	await applyWebVectorResyncSchedule(organizationId, installed);
	return { installed };
};

export const syncVectorAgentsForOrganization = async (
	organizationId: string,
): Promise<Array<{ serverId: string; error: string }>> => {
	const servers = await findServersWithLogManagementEnabled(organizationId);
	const webOwnsThisOrg =
		!IS_CLOUD &&
		(await getWebServerSettings())?.logManagementOrganizationId ===
			organizationId;

	if (servers.length === 0 && !webOwnsThisOrg) {
		return [];
	}

	const preloaded = await loadVectorOrgData(organizationId);

	const targets: Array<{
		id: string;
		run: () => Promise<{ installed: boolean }>;
	}> = [
		...servers.map((s) => ({
			id: s.serverId,
			run: () => syncVectorAgentAndSchedule(s.serverId, preloaded),
		})),
		...(webOwnsThisOrg
			? [
					{
						id: "web",
						run: () => syncWebVectorAgentAndSchedule(organizationId, preloaded),
					},
				]
			: []),
	];

	const results = await Promise.allSettled(targets.map((t) => t.run()));

	const errors: Array<{ serverId: string; error: string }> = [];
	results.forEach((result, index) => {
		if (result.status === "rejected") {
			const target = targets[index];
			if (target) {
				errors.push({
					serverId: target.id,
					error:
						result.reason instanceof Error
							? result.reason.message
							: String(result.reason),
				});
			}
		}
	});
	return errors;
};

export const safeSyncVectorAgentsForOrganization = async (
	organizationId: string,
) => {
	try {
		return await syncVectorAgentsForOrganization(organizationId);
	} catch (error) {
		return [
			{
				serverId: "unknown",
				error: error instanceof Error ? error.message : String(error),
			},
		];
	}
};

export const teardownVectorForOrganizationDeletion = async (
	organizationId: string,
): Promise<void> => {
	const servers = await findServersWithLogManagementEnabled(organizationId);
	await Promise.all(
		servers.map(async (s) => {
			await removeVectorAgent({ serverId: s.serverId }).catch((error) => {
				console.error(
					`[Vector] Failed to remove agent for server ${s.serverId} before deleting organization ${organizationId}:`,
					error,
				);
			});
			await applyVectorResyncSchedule(s.serverId, false);
		}),
	);

	if (!IS_CLOUD) {
		const settings = await getWebServerSettings();
		if (settings?.logManagementOrganizationId === organizationId) {
			await removeWebVectorAgent().catch((error) => {
				console.error(
					`[Vector] Failed to remove local agent before deleting organization ${organizationId}:`,
					error,
				);
			});
			await applyWebVectorResyncSchedule(organizationId, false);
			await updateWebServerSettings({
				enableLogManagement: false,
				logManagementOrganizationId: null,
			});
		}
	}
};
