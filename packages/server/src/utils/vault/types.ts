import type { VaultProviderConfig } from "@dokploy/server/db/schema";

export interface VaultClient<
	C extends VaultProviderConfig = VaultProviderConfig,
> {
	getSecrets(config: C, refs: string[]): Promise<Record<string, string>>;
	testConnection(config: C): Promise<void>;
	listSecretNames?(config: C): Promise<string[]>;
}

export const VAULT_REQUEST_TIMEOUT_MS = 15_000;

export const vaultFetch = async (url: string, init: RequestInit = {}) => {
	return await fetch(url, {
		...init,
		signal: AbortSignal.timeout(VAULT_REQUEST_TIMEOUT_MS),
	});
};

// For vault clients (e.g. SDK-based, non-fetch) that don't support an AbortSignal directly.
export const vaultFetchWithTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number = VAULT_REQUEST_TIMEOUT_MS,
): Promise<T> => {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Request timed out after ${timeoutMs}ms`)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(timer!);
	}
};
