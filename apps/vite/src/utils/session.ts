import { getSessionFn } from "~/server-fns/session";

type SessionData = Awaited<ReturnType<typeof getSessionFn>>;

let cached: { at: number; session: SessionData } | null = null;

const TTL_MS = 30_000;

export const getCachedSession = async (): Promise<SessionData> => {
	if (typeof window === "undefined") {
		return await getSessionFn();
	}
	if (cached && Date.now() - cached.at < TTL_MS) {
		return cached.session;
	}
	const session = await getSessionFn();
	cached = { at: Date.now(), session };
	return session;
};

export const clearSessionCache = () => {
	cached = null;
};
