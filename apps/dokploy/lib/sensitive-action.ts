const SENSITIVE_VERIFICATION_REQUIRED = "SENSITIVE_VERIFICATION_REQUIRED";
export const VERIFICATION_CANCELLED_MESSAGE = "Identity verification cancelled";

const REAUTH_STORAGE_KEY = "dokploy-reauth";

let pending: {
	promise: Promise<boolean>;
	resolve: (ok: boolean) => void;
} | null = null;
const listeners = new Set<() => void>();

const notify = () => {
	for (const listener of listeners) listener();
};

export const isSensitiveVerificationError = (error: unknown) =>
	(error as { message?: string } | null)?.message ===
	SENSITIVE_VERIFICATION_REQUIRED;

export const requestSensitiveVerification = (): Promise<boolean> => {
	if (pending) return pending.promise;
	let resolve!: (ok: boolean) => void;
	const promise = new Promise<boolean>((r) => {
		resolve = r;
	});
	pending = { promise, resolve };
	notify();
	return promise;
};

export const resolveSensitiveVerification = (ok: boolean) => {
	const current = pending;
	pending = null;
	notify();
	current?.resolve(ok);
};

export const subscribeSensitiveVerification = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const isSensitiveVerificationPending = () => pending !== null;

export const saveReauthContext = (context: {
	organizationId: string;
	userId: string;
}) => {
	try {
		sessionStorage.setItem(REAUTH_STORAGE_KEY, JSON.stringify(context));
	} catch {}
};

export const clearReauthContext = () => {
	try {
		sessionStorage.removeItem(REAUTH_STORAGE_KEY);
	} catch {}
};

export const takeReauthContext = (): {
	organizationId: string;
	userId: string;
} | null => {
	try {
		const raw = sessionStorage.getItem(REAUTH_STORAGE_KEY);
		sessionStorage.removeItem(REAUTH_STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
};

// For better-auth client calls, which bypass the tRPC link.
export const withSensitiveVerification = async <
	T extends { error?: { message?: string } | null },
>(
	call: () => Promise<T>,
): Promise<T> => {
	const result = await call();
	if (!isSensitiveVerificationError(result.error)) return result;
	if (!(await requestSensitiveVerification())) {
		return { ...result, error: { message: VERIFICATION_CANCELLED_MESSAGE } };
	}
	return call();
};
