import type { DnsProviderConfig } from "@dokploy/server/db/schema";
import { autodnsClient } from "./autodns";
import { cloudflareClient } from "./cloudflare";
import { route53Client } from "./route53";
import type { DnsClient } from "./types";

const clients: Record<DnsProviderConfig["providerType"], DnsClient> = {
	cloudflare: cloudflareClient as DnsClient,
	route53: route53Client as DnsClient,
	autodns: autodnsClient as DnsClient,
};

export const getDnsClient = (providerType: DnsProviderConfig["providerType"]) =>
	clients[providerType];

export * from "./types";
