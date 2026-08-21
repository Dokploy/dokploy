import {
	ChangeResourceRecordSetsCommand,
	ListHostedZonesCommand,
	ListResourceRecordSetsCommand,
	type ResourceRecordSet,
	Route53Client,
} from "@aws-sdk/client-route-53";
import type {
	DnsRecordType,
	route53DnsConfigSchema,
} from "@dokploy/server/db/schema";
import type { z } from "zod";
import type { DnsClient } from "./types";

type Route53Config = z.infer<typeof route53DnsConfigSchema>;

const createClient = (config: Route53Config) =>
	new Route53Client({
		region: "us-east-1",
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
	});

const stripTrailingDot = (name: string) => name.replace(/\.$/, "");
const ensureTrailingDot = (name: string) =>
	name.endsWith(".") ? name : `${name}.`;
const stripZonePrefix = (id: string) => id.replace(/^\/hostedzone\//, "");

const buildRecordId = (type: string, name: string) =>
	`${type}:${stripTrailingDot(name)}`;

const parseRecordId = (id: string) => {
	const separatorIndex = id.indexOf(":");
	if (separatorIndex === -1) {
		throw new Error(`Invalid Route53 record id: "${id}"`);
	}
	return {
		type: id.slice(0, separatorIndex),
		name: id.slice(separatorIndex + 1),
	};
};

const findExactRecordSet = async (
	config: Route53Config,
	zoneId: string,
	type: string,
	name: string,
): Promise<ResourceRecordSet | undefined> => {
	const client = createClient(config);
	const response = await client.send(
		new ListResourceRecordSetsCommand({
			HostedZoneId: zoneId,
			StartRecordName: ensureTrailingDot(name),
			StartRecordType: type as ResourceRecordSet["Type"],
			MaxItems: 1,
		}),
	);
	const candidate = response.ResourceRecordSets?.[0];
	if (
		candidate &&
		candidate.Type === type &&
		stripTrailingDot(candidate.Name ?? "") === stripTrailingDot(name)
	) {
		return candidate;
	}
	return undefined;
};

const formatValue = (type: DnsRecordType, value: string) =>
	type === "TXT" && !value.startsWith('"') ? JSON.stringify(value) : value;

const buildRecordSet = (record: {
	type: DnsRecordType;
	name: string;
	content: string;
	ttl?: number;
}): ResourceRecordSet => ({
	Name: ensureTrailingDot(record.name),
	Type: record.type as ResourceRecordSet["Type"],
	TTL: record.ttl ?? 300,
	ResourceRecords: record.content
		.split("\n")
		.map((value) => value.trim())
		.filter(Boolean)
		.map((value) => ({ Value: formatValue(record.type, value) })),
});

export const route53Client: DnsClient<Route53Config> = {
	async listZones(config) {
		const client = createClient(config);
		const zones: { id: string; name: string }[] = [];
		let marker: string | undefined;
		do {
			const response = await client.send(
				new ListHostedZonesCommand({ Marker: marker, MaxItems: 100 }),
			);
			for (const zone of response.HostedZones ?? []) {
				if (zone.Id && zone.Name) {
					zones.push({
						id: stripZonePrefix(zone.Id),
						name: stripTrailingDot(zone.Name),
					});
				}
			}
			marker = response.IsTruncated ? response.NextMarker : undefined;
		} while (marker);
		return zones;
	},

	async listRecords(config, zoneId) {
		const client = createClient(config);
		const records: {
			id: string;
			type: string;
			name: string;
			content: string;
			ttl: number;
		}[] = [];
		let nextName: string | undefined;
		let nextType: string | undefined;
		do {
			const response = await client.send(
				new ListResourceRecordSetsCommand({
					HostedZoneId: zoneId,
					StartRecordName: nextName,
					StartRecordType: nextType as ResourceRecordSet["Type"] | undefined,
				}),
			);
			for (const set of response.ResourceRecordSets ?? []) {
				if (!set.Name || !set.Type || !set.ResourceRecords?.length) {
					continue;
				}
				records.push({
					id: buildRecordId(set.Type, set.Name),
					type: set.Type,
					name: stripTrailingDot(set.Name),
					content: set.ResourceRecords.map((r) => r.Value).join("\n"),
					ttl: set.TTL ?? 300,
				});
			}
			nextName = response.IsTruncated ? response.NextRecordName : undefined;
			nextType = response.IsTruncated ? response.NextRecordType : undefined;
		} while (nextName);
		return records;
	},

	async upsertRecord(config, record) {
		const client = createClient(config);
		const existing = await findExactRecordSet(
			config,
			record.zoneId,
			record.type,
			record.name,
		);
		const recordSet = buildRecordSet(record);
		if (existing?.ResourceRecords?.length) {
			const values = new Set([
				...existing.ResourceRecords.map((r) => r.Value),
				...(recordSet.ResourceRecords ?? []).map((r) => r.Value),
			]);
			recordSet.ResourceRecords = [...values].map((Value) => ({ Value }));
		}
		await client.send(
			new ChangeResourceRecordSetsCommand({
				HostedZoneId: record.zoneId,
				ChangeBatch: {
					Changes: [{ Action: "UPSERT", ResourceRecordSet: recordSet }],
				},
			}),
		);
		return { id: buildRecordId(record.type, record.name) };
	},

	async updateRecord(config, zoneId, recordIdInput, record) {
		const { type: oldType, name: oldName } = parseRecordId(recordIdInput);
		const client = createClient(config);

		const changes: {
			Action: "DELETE" | "UPSERT";
			ResourceRecordSet: ResourceRecordSet;
		}[] = [];

		const sameIdentity =
			oldType === record.type &&
			stripTrailingDot(oldName) === stripTrailingDot(record.name);

		if (!sameIdentity) {
			const existing = await findExactRecordSet(
				config,
				zoneId,
				oldType,
				oldName,
			);
			if (existing) {
				changes.push({ Action: "DELETE", ResourceRecordSet: existing });
			}
		}

		changes.push({
			Action: "UPSERT",
			ResourceRecordSet: buildRecordSet(record),
		});

		await client.send(
			new ChangeResourceRecordSetsCommand({
				HostedZoneId: zoneId,
				ChangeBatch: { Changes: changes },
			}),
		);

		return { id: buildRecordId(record.type, record.name) };
	},

	async deleteRecord(config, zoneId, recordIdInput) {
		const { type, name } = parseRecordId(recordIdInput);
		const existing = await findExactRecordSet(config, zoneId, type, name);
		if (!existing) {
			throw new Error(`Route53: record "${name}" (${type}) not found`);
		}
		const client = createClient(config);
		await client.send(
			new ChangeResourceRecordSetsCommand({
				HostedZoneId: zoneId,
				ChangeBatch: {
					Changes: [{ Action: "DELETE", ResourceRecordSet: existing }],
				},
			}),
		);
	},

	async testConnection(config) {
		const client = createClient(config);
		await client.send(new ListHostedZonesCommand({ MaxItems: 1 }));
	},
};
