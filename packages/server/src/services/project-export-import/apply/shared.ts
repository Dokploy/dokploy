import {
	certificates,
	destinations,
	dnsProvider,
	network,
	registry,
	sshKeys,
	vaultProvider,
} from "@dokploy/server/db/schema";
import { ADDITIONAL_FLAG_REGEX } from "@dokploy/server/db/validations/destination";
import { eq } from "drizzle-orm";
import { conflictResolutionsOf } from "../conflicts";
import type { TransferTx } from "../queries";
import { LOCAL_SERVER_CANDIDATE_ID, requirementKey } from "../resolve";
import { restoreSecretFields } from "../secret-fields";
import type { Plan, Requirement, Snapshot } from "../types";
import { conflictKey } from "../types";

export type SharedIdMaps = {
	destination: Record<string, string>;
	registry: Record<string, string>;
	sshKey: Record<string, string>;
	network: Record<string, string>;
	certificate: Record<string, string>;
	vaultProvider: Record<string, string>;
};

const emptySharedIdMaps = (): SharedIdMaps => ({
	destination: {},
	registry: {},
	sshKey: {},
	network: {},
	certificate: {},
	vaultProvider: {},
});

const serverOf = (row: Record<string, unknown>, plan: Plan) => ({
	serverId: plan.serverMap[(row.serverId as string | null) ?? "null"] ?? null,
});

type SharedInsertSpec = {
	idField: string;
	table: typeof registry;
	secretKind: Parameters<typeof restoreSecretFields>[0];
	mapKey: keyof SharedIdMaps;
	extra?: (row: Record<string, unknown>, plan: Plan) => Record<string, unknown>;
};

const SHARED_INSERTS: Partial<Record<Requirement["kind"], SharedInsertSpec>> = {
	vault: {
		idField: "vaultProviderId",
		table: vaultProvider as unknown as typeof registry,
		secretKind: "vaultProvider",
		mapKey: "vaultProvider",
		extra: () => ({ assignments: [] }),
	},
	destination: {
		idField: "destinationId",
		table: destinations as unknown as typeof registry,
		secretKind: "destination",
		mapKey: "destination",
	},
	registry: {
		idField: "registryId",
		table: registry,
		secretKind: "registry",
		mapKey: "registry",
	},
	sshKey: {
		idField: "sshKeyId",
		table: sshKeys as unknown as typeof registry,
		secretKind: "sshKey",
		mapKey: "sshKey",
	},
	certificate: {
		idField: "certificateId",
		table: certificates as unknown as typeof registry,
		secretKind: "certificate",
		mapKey: "certificate",
		extra: (row: Record<string, unknown>, plan: Plan) => ({
			certificatePath: undefined,
			...serverOf(row, plan),
		}),
	},
};

const findSharedRow = (
	snapshot: Snapshot,
	requirement: Requirement,
	idField: string,
): Record<string, unknown> | undefined =>
	(snapshot.resources.shared[requirement.kind] ?? []).find(
		(row) => row[idField] === requirement.originalId,
	);

const REUSE_ORG_LOOKUP: Partial<
	Record<
		Requirement["kind"],
		(
			tx: TransferTx,
			targetId: string,
		) => Promise<{ organizationId: string } | undefined>
	>
> = {
	vault: (tx, id) =>
		tx.query.vaultProvider.findFirst({
			where: (fields, { eq }) => eq(fields.vaultProviderId, id),
			columns: { organizationId: true },
		}),
	destination: (tx, id) =>
		tx.query.destinations.findFirst({
			where: (fields, { eq }) => eq(fields.destinationId, id),
			columns: { organizationId: true },
		}),
	registry: (tx, id) =>
		tx.query.registry.findFirst({
			where: (fields, { eq }) => eq(fields.registryId, id),
			columns: { organizationId: true },
		}),
	sshKey: (tx, id) =>
		tx.query.sshKeys.findFirst({
			where: (fields, { eq }) => eq(fields.sshKeyId, id),
			columns: { organizationId: true },
		}),
	network: (tx, id) =>
		tx.query.network.findFirst({
			where: (fields, { eq }) => eq(fields.networkId, id),
			columns: { organizationId: true },
		}),
	certificate: (tx, id) =>
		tx.query.certificates.findFirst({
			where: (fields, { eq }) => eq(fields.certificateId, id),
			columns: { organizationId: true },
		}),
	server: (tx, id) =>
		tx.query.server.findFirst({
			where: (fields, { eq }) => eq(fields.serverId, id),
			columns: { organizationId: true },
		}),
};

const assertReuseTargetInOrg = async (
	tx: TransferTx,
	requirement: Requirement,
	targetId: string,
	organizationId: string,
): Promise<void> => {
	if (requirement.kind === "server" && targetId === LOCAL_SERVER_CANDIDATE_ID) {
		return;
	}
	const lookup = REUSE_ORG_LOOKUP[requirement.kind];
	if (!lookup) return;
	const target = await lookup(tx, targetId);
	if (!target || target.organizationId !== organizationId) {
		throw new Error(
			`Cannot reuse ${requirement.kind} "${targetId}": not found in this organization`,
		);
	}
};

export const insertSharedByValue = async (
	tx: TransferTx,
	snapshot: Snapshot,
	plan: Plan,
	secretsPlain: Map<string, string>,
	organizationId: string,
): Promise<{ idMaps: SharedIdMaps; vaultNameMap: Record<string, string> }> => {
	const idMaps = emptySharedIdMaps();
	const vaultNameMap: Record<string, string> = {};
	const conflictResolutions = conflictResolutionsOf(plan);

	for (const requirement of snapshot.requirements) {
		const resolution = plan.resolutions[requirementKey(requirement)];
		if (!resolution) continue;

		if (resolution.action === "reuse" && resolution.targetId) {
			await assertReuseTargetInOrg(
				tx,
				requirement,
				resolution.targetId,
				organizationId,
			);
			if (requirement.originalId) {
				setResolvedId(
					idMaps,
					requirement.kind,
					requirement.originalId,
					resolution.targetId,
				);
			}
			if (requirement.kind === "vault") {
				const row = await tx.query.vaultProvider.findFirst({
					where: (fields, { eq }) =>
						eq(fields.vaultProviderId, resolution.targetId as string),
				});
				if (row) {
					vaultNameMap[requirement.providerName] = row.name;
				}
			}
			continue;
		}

		if (resolution.action !== "create" || !requirement.originalId) continue;

		if (requirement.kind === "network") {
			const row = findSharedRow(snapshot, requirement, "networkId");
			if (!row) continue;
			const key = conflictKey({ kind: "network", value: requirement.name });
			const resolution = conflictResolutions[key];
			if (resolution?.action === "skip") continue;
			if (resolution?.action === "keep") {
				const existing = plan.conflicts.find(
					(conflict) => conflictKey(conflict) === key,
				);
				if (existing) {
					idMaps.network[requirement.originalId] = existing.existingId;
					continue;
				}
			}
			const oldServerId = (row.serverId as string | null) ?? null;
			const [inserted] = await tx
				.insert(network)
				.values({
					...row,
					networkId: undefined,
					name:
						resolution?.action === "rename" && resolution.value
							? resolution.value.trim()
							: row.name,
					organizationId,
					serverId: plan.serverMap[oldServerId ?? "null"] ?? null,
				} as unknown as typeof network.$inferInsert)
				.returning();
			if (inserted) {
				idMaps.network[requirement.originalId] = inserted.networkId;
			}
			continue;
		}

		const spec = SHARED_INSERTS[requirement.kind];
		if (!spec) continue;
		const row = findSharedRow(snapshot, requirement, spec.idField);
		if (!row) continue;
		if (requirement.kind === "destination") {
			const flags = (row.additionalFlags as unknown[] | null) ?? [];
			if (
				flags.some(
					(flag) =>
						typeof flag !== "string" || !ADDITIONAL_FLAG_REGEX.test(flag),
				)
			) {
				throw new Error(
					`Destination "${row.name}" in the bundle has invalid additional rclone flags`,
				);
			}
		}
		const restored = restoreSecretFields(spec.secretKind, row, secretsPlain);
		const [inserted] = await tx
			.insert(spec.table)
			.values({
				...restored,
				[spec.idField]: undefined,
				organizationId,
				...spec.extra?.(row, plan),
			} as unknown as typeof registry.$inferInsert)
			.returning();
		if (!inserted) continue;
		const newId = (inserted as Record<string, unknown>)[spec.idField] as string;
		idMaps[spec.mapKey][requirement.originalId] = newId;
		if (requirement.kind === "vault") {
			vaultNameMap[requirement.providerName] = (
				inserted as Record<string, unknown>
			).name as string;
		}
	}

	for (const row of snapshot.resources.shared.dnsProvider ?? []) {
		const name = row.name as string;
		const existing = await tx.query.dnsProvider.findFirst({
			where: (fields, { and, eq }) =>
				and(eq(fields.organizationId, organizationId), eq(fields.name, name)),
		});
		if (existing) continue;
		const restored = restoreSecretFields("dnsProvider", row, secretsPlain);
		await tx.insert(dnsProvider).values({
			...restored,
			dnsProviderId: undefined,
			organizationId,
		} as unknown as typeof dnsProvider.$inferInsert);
	}

	return { idMaps, vaultNameMap };
};

const SHARED_MAP_KEY: Partial<Record<Requirement["kind"], keyof SharedIdMaps>> =
	{
		vault: "vaultProvider",
		destination: "destination",
		registry: "registry",
		sshKey: "sshKey",
		network: "network",
		certificate: "certificate",
	};

const setResolvedId = (
	idMaps: SharedIdMaps,
	kind: Requirement["kind"],
	originalId: string,
	targetId: string,
) => {
	const mapKey = SHARED_MAP_KEY[kind];
	if (mapKey) idMaps[mapKey][originalId] = targetId;
};

export const applyVaultAssignments = async (
	tx: TransferTx,
	snapshot: Snapshot,
	idMaps: SharedIdMaps,
	newProjectId: string,
	newEnvironmentIds: string[],
): Promise<void> => {
	const vaultOriginalIds = new Set(
		snapshot.requirements
			.filter((r) => r.kind === "vault" && r.originalId)
			.map((r) => r.originalId as string),
	);
	for (const originalId of vaultOriginalIds) {
		const vaultProviderId = idMaps.vaultProvider[originalId];
		if (!vaultProviderId) continue;
		const row = await tx.query.vaultProvider.findFirst({
			where: (fields, { eq }) => eq(fields.vaultProviderId, vaultProviderId),
		});
		if (!row) continue;
		const assignments = Array.isArray(row.assignments) ? row.assignments : [];
		await tx
			.update(vaultProvider)
			.set({
				assignments: [
					...assignments,
					{ projectId: newProjectId, environmentIds: newEnvironmentIds },
				],
			})
			.where(eq(vaultProvider.vaultProviderId, vaultProviderId));
	}
};
