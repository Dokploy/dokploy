import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	isCloud: false,
	enabled: true,
	session: null as { createdAt: Date; sensitiveVerifiedAt: Date | null } | null,
}));

vi.mock("@dokploy/server/constants", () => ({
	get IS_CLOUD() {
		return state.isCloud;
	},
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(async () => ({
		requireSensitiveActionVerification: state.enabled,
	})),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			session: { findFirst: vi.fn(async () => state.session) },
		},
	},
}));

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
		impersonatedBy: null,
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
	beforeEach(() => {
		state.isCloud = false;
		state.enabled = true;
		state.session = { createdAt: minutesAgo(60), sensitiveVerifiedAt: null };
	});

	it("allows everything when the toggle is off", async () => {
		state.enabled = false;
		expect(await check()).toBe(true);
	});

	it("never applies on Cloud", async () => {
		state.isCloud = true;
		expect(await check()).toBe(true);
	});

	it("exempts API key requests", async () => {
		expect(await check({ isApiKeyRequest: true })).toBe(true);
	});

	it("rejects impersonated sessions even when fresh", async () => {
		state.session = { createdAt: new Date(), sensitiveVerifiedAt: null };
		expect(await check({ impersonatedBy: "admin-1" })).toBe(false);
	});

	it("allows a session created within the window", async () => {
		state.session = { createdAt: minutesAgo(2), sensitiveVerifiedAt: null };
		expect(await check()).toBe(true);
	});

	it("allows a session verified within the window", async () => {
		state.session = {
			createdAt: minutesAgo(60),
			sensitiveVerifiedAt: minutesAgo(2),
		};
		expect(await check()).toBe(true);
	});

	it("rejects a stale session", async () => {
		state.session = {
			createdAt: minutesAgo(60),
			sensitiveVerifiedAt: minutesAgo(10),
		};
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
