import { createHash } from "node:crypto";
import { db } from "@dokploy/server/db";
import {
	applications,
	azureDevops,
	azureDevopsHook,
	compose,
} from "@dokploy/server/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
	AzureDevopsClient,
	AzureDevopsError,
	type AzureSubscription,
} from "../utils/providers/azure-devops-client";
import { getDokployUrl } from "./admin";

type ServiceType = "application" | "compose";
type Hook = typeof azureDevopsHook.$inferSelect;
const hookPath = (id?: string) => [
	"_apis",
	"hooks",
	"subscriptions",
	...(id ? [id] : []),
];
const safeError = (error: unknown) =>
	error instanceof AzureDevopsError
		? error.message
		: "Could not synchronize Azure DevOps service hook. Retry after checking connectivity and permissions.";
const isServiceHook = (
	subscription: AzureSubscription,
	type: ServiceType,
	id: string,
) => {
	try {
		return (
			new URL(subscription.consumerInputs?.url || "").searchParams.get(
				"dokployService",
			) === `${type}:${id}`
		);
	} catch {
		return false;
	}
};

export const azureHookFieldsChanged = (input: object) =>
	Object.keys(input).some(
		(key) =>
			key.startsWith("azureDevops") ||
			["sourceType", "autoDeploy", "refreshToken"].includes(key),
	);

export const getAzureDevopsHookStatus = async (
	serviceType: ServiceType,
	serviceId: string,
) =>
	db.query.azureDevopsHook.findMany({
		where: and(
			eq(azureDevopsHook.serviceType, serviceType),
			eq(azureDevopsHook.serviceId, serviceId),
		),
	});

export const syncAzureDevopsWebhook = async (
	serviceType: ServiceType,
	serviceId: string,
	remove = false,
) => {
	const current =
		serviceType === "application"
			? await db.query.applications.findFirst({
					where: eq(applications.applicationId, serviceId),
					with: { environment: { with: { project: true } } },
				})
			: await db.query.compose.findFirst({
					where: eq(compose.composeId, serviceId),
					with: { environment: { with: { project: true } } },
				});
	if (
		current?.sourceType !== "azureDevops" &&
		!(await getAzureDevopsHookStatus(serviceType, serviceId)).length
	)
		return [];

	// Commit the intent before contacting Azure so a process crash after a
	// successful POST still leaves enough information to recover or clean up.
	if (!remove) {
		const service = current;
		if (service?.sourceType === "azureDevops" && service.azureDevopsId) {
			const provider = await db.query.azureDevops.findFirst({
				where: eq(azureDevops.azureDevopsId, service.azureDevopsId),
			});
			if (provider)
				await db
					.insert(azureDevopsHook)
					.values({
						organizationId: service.environment.project.organizationId,
						serviceType,
						serviceId,
						azureDevopsId: provider.azureDevopsId,
						baseUrl: provider.baseUrl,
						projectId: service.azureDevopsProjectId || "",
						status: service.autoDeploy ? "pending" : "disabled",
					})
					.onConflictDoNothing();
		}
	}
	// PostgreSQL coordinates concurrent saves and workers across Dokploy processes.
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`azure-hook:${serviceType}:${serviceId}`}, 0))`,
		);
		const service =
			serviceType === "application"
				? await tx.query.applications.findFirst({
						where: eq(applications.applicationId, serviceId),
						with: { environment: { with: { project: true } } },
					})
				: await tx.query.compose.findFirst({
						where: eq(compose.composeId, serviceId),
						with: { environment: { with: { project: true } } },
					});
		let records = await tx.query.azureDevopsHook.findMany({
			where: and(
				eq(azureDevopsHook.serviceType, serviceType),
				eq(azureDevopsHook.serviceId, serviceId),
			),
		});
		const desiredId =
			!remove && service?.sourceType === "azureDevops"
				? service.azureDevopsId
				: null;
		const save = async (record: Hook, data: Partial<Hook>) =>
			tx
				.update(azureDevopsHook)
				.set(data)
				.where(eq(azureDevopsHook.id, record.id));
		for (const record of records) {
			if (record.azureDevopsId === desiredId) continue;
			try {
				const provider = await tx.query.azureDevops.findFirst({
					where: eq(azureDevops.azureDevopsId, record.azureDevopsId),
				});
				if (record.subscriptionId || record.status !== "disabled") {
					if (!provider || provider.baseUrl !== record.baseUrl)
						throw new AzureDevopsError(
							"Remote cleanup requires the original provider credentials. Remove the recorded subscription in Azure DevOps.",
						);
					const client = new AzureDevopsClient(
						record.baseUrl,
						provider.personalAccessToken,
					);
					const ids = record.subscriptionId
						? [record.subscriptionId]
						: (await client.subscriptions())
								.filter((s) => isServiceHook(s, serviceType, serviceId))
								.map((s) => s.id);
					for (const id of ids) {
						await save(record, { subscriptionId: id });
						try {
							await client.call(hookPath(id), {}, "DELETE");
						} catch (error) {
							if (!(error instanceof AzureDevopsError && error.status === 404))
								throw error;
						}
					}
				}
				await tx
					.delete(azureDevopsHook)
					.where(eq(azureDevopsHook.id, record.id));
			} catch (error) {
				await save(record, {
					status: "cleanupPending",
					error: safeError(error),
					configurationHash: null,
				});
			}
		}
		if (!desiredId || !service)
			return tx.query.azureDevopsHook.findMany({
				where: and(
					eq(azureDevopsHook.serviceType, serviceType),
					eq(azureDevopsHook.serviceId, serviceId),
				),
			});
		const provider = await tx.query.azureDevops.findFirst({
			where: eq(azureDevops.azureDevopsId, desiredId),
		});
		if (!provider) return records;
		let record = records.find((r) => r.azureDevopsId === desiredId);
		if (!record) {
			const [created] = await tx
				.insert(azureDevopsHook)
				.values({
					organizationId: service.environment.project.organizationId,
					serviceType,
					serviceId,
					azureDevopsId: desiredId,
					baseUrl: provider.baseUrl,
					projectId: service.azureDevopsProjectId || "",
					status: service.autoDeploy ? "pending" : "disabled",
				})
				.returning();
			record = created;
		}
		if (!record) return [];
		try {
			const client = new AzureDevopsClient(
				provider.baseUrl,
				provider.personalAccessToken,
			);
			if (!service.autoDeploy) {
				const ids = record.subscriptionId
					? [record.subscriptionId]
					: record.status === "disabled"
						? []
						: (await client.subscriptions())
								.filter((s) => isServiceHook(s, serviceType, serviceId))
								.map((s) => s.id);
				for (const id of ids) {
					await save(record, { subscriptionId: id });
					try {
						await client.call(hookPath(id), {}, "DELETE");
					} catch (error) {
						if (!(error instanceof AzureDevopsError && error.status === 404))
							throw error;
					}
				}
				await save(record, {
					status: "disabled",
					subscriptionId: null,
					configurationHash: null,
					error: null,
					lastSyncedAt: new Date().toISOString(),
				});
			} else {
				if (!service.refreshToken)
					throw new AzureDevopsError(
						"Rotate the service webhook token before enabling Azure DevOps automatic deployments.",
					);
				const callback = `${(await getDokployUrl()).replace(/\/$/, "")}/api/deploy/${serviceType === "compose" ? "compose/" : ""}${service.refreshToken}?dokployService=${encodeURIComponent(`${serviceType}:${serviceId}`)}`;
				const marker = `Dokploy ${serviceType} ${serviceId}`;
				const desired = {
					callback,
					project: service.azureDevopsProjectId,
					repository: service.azureDevopsRepositoryId,
					branch: service.azureDevopsBranch,
				};
				const hash = createHash("sha256")
					.update(JSON.stringify(desired))
					.digest("hex");
				// Discover before creating: a timed-out POST may have succeeded remotely.
				let subscriptionId = record.subscriptionId;
				if (!subscriptionId) {
					const existing = (await client.subscriptions()).filter((s) =>
						isServiceHook(s, serviceType, serviceId),
					);
					if (existing.length > 1)
						throw new AzureDevopsError(
							"Multiple matching Azure DevOps hooks exist. Remove duplicate subscriptions and retry.",
						);
					subscriptionId = existing[0]?.id || null;
				}
				const { data: publisher } = await client.call<{
					supportedEvents: {
						id: string;
						supportedResourceVersions: string[];
					}[];
				}>(["_apis", "hooks", "publishers", "tfs"]);
				const versions =
					publisher.supportedEvents?.find((e) => e.id === "git.push")
						?.supportedResourceVersions || [];
				const resourceVersion = ["2.0", "1.0"].find((version) =>
					versions.includes(version),
				);
				if (!resourceVersion)
					throw new AzureDevopsError(
						"Azure DevOps does not advertise a supported git.push payload version (2.0 or 1.0).",
					);
				const body = {
					publisherId: "tfs",
					eventType: "git.push",
					resourceVersion,
					consumerId: "webHooks",
					consumerActionId: "httpRequest",
					actionDescription: marker,
					status: "enabled",
					publisherInputs: {
						projectId: service.azureDevopsProjectId,
						repository: service.azureDevopsRepositoryId,
						branch: service.azureDevopsBranch,
					},
					consumerInputs: {
						url: callback,
						resourceDetailsToSend: "all",
						messagesToSend: "none",
						detailedMessagesToSend: "none",
					},
				};
				if (subscriptionId) {
					try {
						await client.call(hookPath(subscriptionId), {}, "PUT", {
							...body,
							id: subscriptionId,
						});
					} catch (error) {
						if (error instanceof AzureDevopsError && error.status === 404)
							subscriptionId = null;
						else throw error;
					}
				}
				if (!subscriptionId)
					subscriptionId = (
						await client.call<AzureSubscription>(hookPath(), {}, "POST", body)
					).data.id;
				if (!subscriptionId)
					throw new AzureDevopsError(
						"Azure DevOps did not return a subscription ID. Retry to reconcile the subscription.",
					);
				await save(record, {
					status: "active",
					subscriptionId,
					baseUrl: provider.baseUrl,
					projectId: service.azureDevopsProjectId || "",
					configurationHash: hash,
					error: null,
					lastSyncedAt: new Date().toISOString(),
				});
			}
		} catch (error) {
			await save(record, { status: "error", error: safeError(error) });
		}
		records = await tx.query.azureDevopsHook.findMany({
			where: and(
				eq(azureDevopsHook.serviceType, serviceType),
				eq(azureDevopsHook.serviceId, serviceId),
			),
		});
		return records;
	});
};

export const reconcileAzureDevopsProvider = async (id: string) => {
	const [apps, stacks] = await Promise.all([
		db.query.applications.findMany({
			where: eq(applications.azureDevopsId, id),
			columns: { applicationId: true },
		}),
		db.query.compose.findMany({
			where: eq(compose.azureDevopsId, id),
			columns: { composeId: true },
		}),
	]);
	for (const app of apps)
		await syncAzureDevopsWebhook("application", app.applicationId);
	for (const stack of stacks)
		await syncAzureDevopsWebhook("compose", stack.composeId);
};

export const cleanupAzureDevopsProvider = async (id: string) => {
	const [apps, stacks] = await Promise.all([
		db.query.applications.findMany({
			where: eq(applications.azureDevopsId, id),
			columns: { applicationId: true },
		}),
		db.query.compose.findMany({
			where: eq(compose.azureDevopsId, id),
			columns: { composeId: true },
		}),
	]);
	for (const app of apps) {
		await db
			.update(applications)
			.set({ refreshToken: nanoid(), autoDeploy: false })
			.where(eq(applications.applicationId, app.applicationId));
		await syncAzureDevopsWebhook("application", app.applicationId, true);
	}
	for (const stack of stacks) {
		await db
			.update(compose)
			.set({ refreshToken: nanoid(), autoDeploy: false })
			.where(eq(compose.composeId, stack.composeId));
		await syncAzureDevopsWebhook("compose", stack.composeId, true);
	}
	const retained = await db.query.azureDevopsHook.findMany({
		where: eq(azureDevopsHook.azureDevopsId, id),
	});
	for (const record of retained) {
		const connected =
			record.serviceType === "application"
				? apps.some((app) => app.applicationId === record.serviceId)
				: stacks.some((stack) => stack.composeId === record.serviceId);
		await syncAzureDevopsWebhook(
			record.serviceType,
			record.serviceId,
			connected,
		);
	}
	return db.query.azureDevopsHook.findMany({
		where: and(
			eq(azureDevopsHook.azureDevopsId, id),
			eq(azureDevopsHook.status, "cleanupPending"),
		),
	});
};

export const reconcileAzureDevopsHooks = async () => {
	const providers = await db.query.azureDevops.findMany({
		columns: { azureDevopsId: true },
	});
	for (const provider of providers)
		await reconcileAzureDevopsProvider(provider.azureDevopsId);
	const records = await db.query.azureDevopsHook.findMany();
	for (const record of records) {
		const service =
			record.serviceType === "application"
				? await db.query.applications.findFirst({
						where: eq(applications.applicationId, record.serviceId),
						columns: { applicationId: true },
					})
				: await db.query.compose.findFirst({
						where: eq(compose.composeId, record.serviceId),
						columns: { composeId: true },
					});
		if (!service || record.status === "cleanupPending")
			await syncAzureDevopsWebhook(record.serviceType, record.serviceId);
	}
};

export const initAzureDevopsHooks = () => {
	let running = false;
	const reconcile = async () => {
		if (running) return;
		running = true;
		try {
			await reconcileAzureDevopsHooks();
		} catch {
			console.error(
				"Azure DevOps hook reconciliation failed; it will be retried.",
			);
		} finally {
			running = false;
		}
	};
	void reconcile();
	const timer = setInterval(() => void reconcile(), 5 * 60_000);
	timer.unref();
};
