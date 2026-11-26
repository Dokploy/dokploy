import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionRow = {
	userId: string;
	createdAt: Date;
	sensitiveVerifiedAt: Date | null;
	impersonatedBy: string | null;
};

const state = vi.hoisted(() => ({
	requiredForUser: true,
	session: null as SessionRow | null,
}));

vi.mock("@dokploy/server/db", () => {
	const chain = {
		from: () => chain,
		innerJoin: () => chain,
		where: () => chain,
		limit: async () => (state.requiredForUser ? [{ id: "member-1" }] : []),
	};
	return {
		db: {
			select: () => chain,
			query: {
				session: { findFirst: vi.fn(async () => state.session) },
			},
		},
	};
});

import {
	consumeVerificationAttempt,
	isSensitiveActionAllowed,
	isSessionFresh,
	resetVerificationAttempts,
	SENSITIVE_WINDOW_MS,
} from "@dokploy/server/services/sensitive-action";

const minutesAgo = (minutes: number) =>
	new Date(Date.now() - minutes * 60 * 1000);

const check = (
	overrides: Partial<Parameters<typeof isSensitiveActionAllowed>[0]> = {},
) =>
	isSensitiveActionAllowed({
		sessionId: "session-1",
		isApiKeyRequest: false,
		...overrides,
	});

describe("isSessionFresh", () => {
	it("is fresh right at the window edge and stale after it", () => {
		const now = Date.now();
		const createdAt = new Date(now - SENSITIVE_WINDOW_MS);
		expect(isSessionFresh({ createdAt, sensitiveVerifiedAt: null }, now)).toBe(
			true,
		);
		expect(
			isSessionFresh({ createdAt, sensitiveVerifiedAt: null }, now + 1),
		).toBe(false);
	});

	it("uses the most recent of createdAt and sensitiveVerifiedAt", () => {
		expect(
			isSessionFresh({
				createdAt: minutesAgo(60),
				sensitiveVerifiedAt: minutesAgo(1),
			}),
		).toBe(true);
	});
});

describe("isSensitiveActionAllowed", () => {
	const staleSession = (overrides: Partial<SessionRow> = {}): SessionRow => ({
		userId: "user-1",
		createdAt: minutesAgo(60),
		sensitiveVerifiedAt: null,
		impersonatedBy: null,
		...overrides,
	});

	beforeEach(() => {
		state.requiredForUser = true;
		state.session = staleSession();
	});

	it("allows everything when none of the user's organizations require it", async () => {
		state.requiredForUser = false;
		expect(await check()).toBe(true);
	});

	it("exempts API key requests", async () => {
		expect(await check({ isApiKeyRequest: true })).toBe(true);
	});

	it("rejects impersonated sessions even when fresh", async () => {
		state.session = staleSession({
			createdAt: new Date(),
			impersonatedBy: "admin-1",
		});
		expect(await check()).toBe(false);
	});

	it("allows a session created within the window", async () => {
		state.session = staleSession({ createdAt: minutesAgo(2) });
		expect(await check()).toBe(true);
	});

	it("allows a session verified within the window", async () => {
		state.session = staleSession({ sensitiveVerifiedAt: minutesAgo(2) });
		expect(await check()).toBe(true);
	});

	it("rejects a stale session", async () => {
		state.session = staleSession({ sensitiveVerifiedAt: minutesAgo(10) });
		expect(await check()).toBe(false);
	});

	it("rejects when the session is missing", async () => {
		state.session = null;
		expect(await check()).toBe(false);
		expect(await check({ sessionId: undefined })).toBe(false);
	});
});

describe("consumeVerificationAttempt", () => {
	it("allows 5 attempts and rejects the 6th", () => {
		const now = Date.now();
		const results = Array.from({ length: 6 }, () =>
			consumeVerificationAttempt("user-limit", now),
		);
		expect(results).toEqual([true, true, true, true, true, false]);
	});

	it("starts over after a successful verification", () => {
		const now = Date.now();
		for (let i = 0; i < 5; i++) consumeVerificationAttempt("user-reset", now);
		resetVerificationAttempts("user-reset");
		expect(consumeVerificationAttempt("user-reset", now)).toBe(true);
	});

	it("starts over once the window expires", () => {
		const now = Date.now();
		for (let i = 0; i < 6; i++) consumeVerificationAttempt("user-window", now);
		expect(
			consumeVerificationAttempt("user-window", now + SENSITIVE_WINDOW_MS + 1),
		).toBe(true);
	});
});
