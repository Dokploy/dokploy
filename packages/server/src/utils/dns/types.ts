import type {
	DnsProviderConfig,
	DnsRecordType,
} from "@dokploy/server/db/schema";

export interface DnsZone {
	id: string;
	name: string;
}

export interface DnsRecordInput {
	zoneId: string;
	type: DnsRecordType;
	name: string;
	content: string;
	ttl?: number;
	proxied?: boolean;
}

export interface DnsRecord {
	id: string;
	type: string;
	name: string;
	content: string;
	ttl: number;
	proxied?: boolean;
}

export interface DnsClient<C extends DnsProviderConfig = DnsProviderConfig> {
	listZones(config: C): Promise<DnsZone[]>;
	listRecords(config: C, zoneId: string): Promise<DnsRecord[]>;
	upsertRecord(config: C, record: DnsRecordInput): Promise<{ id: string }>;
	updateRecord(
		config: C,
		zoneId: string,
		recordId: string,
		record: Omit<DnsRecordInput, "zoneId">,
	): Promise<{ id: string }>;
	deleteRecord(config: C, zoneId: string, recordId: string): Promise<void>;
	testConnection(config: C): Promise<void>;
}

export const DNS_REQUEST_TIMEOUT_MS = 15_000;

export const dnsFetch = async (url: string, init: RequestInit = {}) => {
	return await fetch(url, {
		...init,
		signal: AbortSignal.timeout(DNS_REQUEST_TIMEOUT_MS),
	});
};
