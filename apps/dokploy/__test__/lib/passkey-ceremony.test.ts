import { describe, expect, it } from "vitest";
import {
	getPasskeyErrorMessage,
	isPasskeyCeremonyAbort,
	isPasskeyNotAllowed,
	isPasskeySecurityError,
	PasskeyCeremonyBusyError,
	runPasskeyCeremony,
	waitForPasskeyCeremonyIdle,
} from "@/lib/passkey-ceremony";

describe("runPasskeyCeremony", () => {
	it("rejects concurrent calls with a user-facing busy message", async () => {
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = runPasskeyCeremony(async () => {
			await firstGate;
			return "first";
		});

		await expect(
			runPasskeyCeremony(async () => "second"),
		).rejects.toBeInstanceOf(PasskeyCeremonyBusyError);

		releaseFirst?.();
		await expect(first).resolves.toBe("first");
	});

	it("allows sequential ceremonies after the first completes", async () => {
		await runPasskeyCeremony(async () => "done");
		await expect(
			runPasskeyCeremony(async () => "next"),
		).resolves.toBe("next");
	});
});

describe("waitForPasskeyCeremonyIdle", () => {
	it("resolves when no ceremony is in flight", async () => {
		await expect(waitForPasskeyCeremonyIdle()).resolves.toBeUndefined();
	});
});

describe("isPasskeyCeremonyAbort", () => {
	it("detects AbortError", () => {
		expect(isPasskeyCeremonyAbort(new DOMException("aborted", "AbortError"))).toBe(
			true,
		);
	});

	it("detects WebAuthn cancel messages", () => {
		expect(
			isPasskeyCeremonyAbort(new Error("Cancelling existing WebAuthn request")),
		).toBe(true);
	});
});

describe("isPasskeyNotAllowed", () => {
	it("detects NotAllowedError", () => {
		expect(
			isPasskeyNotAllowed(new DOMException("denied", "NotAllowedError")),
		).toBe(true);
	});
});

describe("isPasskeySecurityError", () => {
	it("detects SecurityError", () => {
		expect(
			isPasskeySecurityError(new DOMException("insecure", "SecurityError")),
		).toBe(true);
	});
});

describe("getPasskeyErrorMessage", () => {
	it("maps ceremony abort for sign-in", () => {
		expect(
			getPasskeyErrorMessage({
				error: { code: "AUTH_CANCELLED" },
				flow: "sign-in",
			}),
		).toContain("cancelled");
	});

	it("maps SESSION_NOT_FRESH for register", () => {
		expect(
			getPasskeyErrorMessage({
				error: { code: "SESSION_NOT_FRESH" },
				flow: "register",
			}),
		).toContain("session expired");
	});

	it("maps CHALLENGE_NOT_FOUND for sign-in", () => {
		expect(
			getPasskeyErrorMessage({
				error: { code: "CHALLENGE_NOT_FOUND" },
				flow: "sign-in",
			}),
		).toContain("Refresh the page");
	});

	it("maps busy error from caught exception", () => {
		expect(
			getPasskeyErrorMessage({
				error: {},
				caught: new PasskeyCeremonyBusyError(),
				flow: "sign-in",
			}),
		).toContain("already in progress");
	});

	it("maps NotAllowedError to no-passkey-set-up guidance on sign-in", () => {
		expect(
			getPasskeyErrorMessage({
				error: {},
				caught: new DOMException("denied", "NotAllowedError"),
				flow: "sign-in",
			}),
		).toContain("No passkey is set up for this site yet");
	});

	it("maps PASSKEY_NOT_FOUND to stale passkey guidance on sign-in", () => {
		expect(
			getPasskeyErrorMessage({
				error: { code: "PASSKEY_NOT_FOUND" },
				flow: "sign-in",
			}),
		).toContain("no longer registered");
	});

	it("maps PASSKEY_UNAVAILABLE to first-time setup guidance on sign-in", () => {
		expect(
			getPasskeyErrorMessage({
				error: { code: "PASSKEY_UNAVAILABLE" },
				flow: "sign-in",
			}),
		).toContain("No passkey is set up for this site yet");
	});

	it("maps INVALID_ORIGIN to origin alignment guidance", () => {
		expect(
			getPasskeyErrorMessage({
				error: { code: "INVALID_ORIGIN" },
				flow: "sign-in",
			}),
		).toContain("Settings → Server");
	});
});
