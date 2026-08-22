import type { DnsProviderConfig } from "@dokploy/server/db/schema";
import { cloudflareClient } from "./cloudflare";
import { porkbunClient } from "./porkbun";
import { route53Client } from "./route53";
import type { DnsClient } from "./types";

const clients: Record<DnsProviderConfig["providerType"], DnsClient> = {
	cloudflare: cloudflareClient as DnsClient,
	route53: route53Client as DnsClient,
	porkbun: porkbunClient as DnsClient,
};

export const getDnsClient = (providerType: DnsProviderConfig["providerType"]) =>
	clients[providerType];

export * from "./types";
