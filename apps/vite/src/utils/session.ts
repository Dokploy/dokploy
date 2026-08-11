import { authClient } from "@/lib/auth-client";

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

let cached: { at: number; session: SessionData } | null = null;

const TTL_MS = 30_000;

export const getCachedSession = async (): Promise<SessionData> => {
	if (cached && Date.now() - cached.at < TTL_MS) {
		return cached.session;
	}
	const { data } = await authClient.getSession();
	cached = { at: Date.now(), session: data };
	return data;
};

export const clearSessionCache = () => {
	cached = null;
};
