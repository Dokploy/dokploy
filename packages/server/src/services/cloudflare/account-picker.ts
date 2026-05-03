import type { CloudflareAccount } from "../../db/schema/cloudflare-config";

export type PickResult =
	| { kind: "ok"; accountId: string }
	| { kind: "ambiguous" }
	| { kind: "error"; message: string };

interface PickInput {
	accounts: CloudflareAccount[];
	zoneAccountIds: string[];
	explicitAccountId: string | null;
}

export const pickTunnelAccount = (input: PickInput): PickResult => {
	if (input.accounts.length === 0) {
		return { kind: "error", message: "Cloudflare config has no accounts" };
	}

	if (input.explicitAccountId) {
		const known = input.accounts.some((a) => a.id === input.explicitAccountId);
		if (!known) {
			return {
				kind: "error",
				message: `Account ${input.explicitAccountId} is not on this Cloudflare token`,
			};
		}
		return { kind: "ok", accountId: input.explicitAccountId };
	}

	if (input.accounts.length === 1) {
		return { kind: "ok", accountId: input.accounts[0]!.id };
	}

	const unique = Array.from(new Set(input.zoneAccountIds));
	if (unique.length === 1) {
		return { kind: "ok", accountId: unique[0]! };
	}

	return { kind: "ambiguous" };
};
