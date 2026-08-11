import { createServerFn } from "@tanstack/react-start";

interface SessionPayload {
	session: { id: string; userId: string } | null;
	user: { id: string; email: string } | null;
}

const fetchSession = async (): Promise<SessionPayload | null> => {
	const { getRequest } = await import("@tanstack/react-start/server");
	try {
		const request = getRequest();
		const cookie = request.headers.get("cookie") ?? "";
		if (!cookie) return null;
		const response = await fetch(
			`http://localhost:${process.env.PORT ?? 3000}/api/auth/get-session`,
			{ headers: { cookie } },
		);
		if (!response.ok) return null;
		return (await response.json()) as SessionPayload | null;
	} catch {
		return null;
	}
};

export const getSessionFn = createServerFn({ method: "GET" }).handler(() =>
	fetchSession(),
);
