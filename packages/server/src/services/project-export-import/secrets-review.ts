import type { Snapshot } from "./types";
import { SECRET_REF_PREFIX } from "./types";

export type ReviewableSecret = {
	secretId: string;
	kind: "basicAuth" | "registry" | "destination" | "sshKey" | "certificate";
	resource: string;
	field: string;
	generatable: boolean;
};

const refId = (value: unknown): string | undefined =>
	typeof value === "string" && value.startsWith(SECRET_REF_PREFIX)
		? value.slice(SECRET_REF_PREFIX.length)
		: undefined;

const label = (row: Record<string, unknown>, ...keys: string[]): string => {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return "";
};

export const listReviewableSecrets = (
	snapshot: Snapshot,
): ReviewableSecret[] => {
	const entries: ReviewableSecret[] = [];
	const push = (entry: Omit<ReviewableSecret, "secretId">, value: unknown) => {
		const secretId = refId(value);
		if (secretId) entries.push({ secretId, ...entry });
	};

	for (const service of snapshot.resources.services) {
		if (service.kind !== "application") continue;
		const serviceName = label(service, "name", "appName");
		for (const row of (service.security as Record<string, unknown>[]) ?? []) {
			push(
				{
					kind: "basicAuth",
					resource: `${serviceName} · ${label(row, "username")}`,
					field: "password",
					generatable: true,
				},
				row.password,
			);
		}
	}

	const shared = snapshot.resources.shared;
	for (const row of shared.registry ?? []) {
		push(
			{
				kind: "registry",
				resource: label(row, "registryName", "registryUrl"),
				field: "password",
				generatable: false,
			},
			row.password,
		);
	}
	for (const row of shared.destination ?? []) {
		for (const field of ["accessKey", "secretAccessKey"]) {
			push(
				{
					kind: "destination",
					resource: label(row, "name", "bucket"),
					field,
					generatable: false,
				},
				row[field],
			);
		}
	}
	for (const row of shared.sshKey ?? []) {
		push(
			{
				kind: "sshKey",
				resource: label(row, "name"),
				field: "privateKey",
				generatable: false,
			},
			row.privateKey,
		);
	}
	for (const row of shared.certificate ?? []) {
		push(
			{
				kind: "certificate",
				resource: label(row, "name"),
				field: "privateKey",
				generatable: false,
			},
			row.privateKey,
		);
	}

	return entries;
};
