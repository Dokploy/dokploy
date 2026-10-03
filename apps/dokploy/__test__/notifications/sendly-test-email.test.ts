import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	buildSendlyTestEmail,
	sendSendlyNotification,
} from "@dokploy/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("buildSendlyTestEmail", () => {
	it("stamps the send time into the subject and body", () => {
		const email = buildSendlyTestEmail(new Date("2026-10-03T19:06:09.123Z"));
		expect(email.subject).toBe("Test Email (2026-10-03 19:06:09 UTC)");
		expect(email.html).toContain("Hi, From Dokploy");
		expect(email.html).toContain("Sent at 2026-10-03 19:06:09 UTC.");
	});

	it("gives two clicks a second apart different content", () => {
		const first = buildSendlyTestEmail(new Date("2026-10-03T19:06:09Z"));
		const second = buildSendlyTestEmail(new Date("2026-10-03T19:06:10Z"));
		expect(second.subject).not.toBe(first.subject);
		expect(second.html).not.toBe(first.html);
	});
});

/**
 * A REAL http server stands in for Sendly (no fetch mocks), so the request
 * Dokploy sends is read off the wire.
 */
describe("Sendly test send over HTTP", () => {
	let server: Server;
	let baseUrl = "";
	let received: { auth: string | undefined; body: Record<string, unknown> }[] =
		[];

	beforeAll(async () => {
		server = createServer((req, res) => {
			let raw = "";
			req.on("data", (chunk) => {
				raw += chunk;
			});
			req.on("end", () => {
				received.push({
					auth: req.headers.authorization,
					body: JSON.parse(raw),
				});
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ success: true, data: { emails: [] } }));
			});
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	beforeEach(() => {
		received = [];
	});

	it("sends a different subject for each test click", async () => {
		const connection = {
			sendlyId: "sendly-1",
			apiKey: "sk_local",
			fromAddress: "alerts@example.com",
			toAddresses: ["team@example.com"],
			baseUrl,
		};
		for (const at of ["2026-10-03T19:06:09Z", "2026-10-03T19:07:30Z"]) {
			const { subject, html } = buildSendlyTestEmail(new Date(at));
			await sendSendlyNotification(connection, subject, html);
		}

		expect(received).toHaveLength(2);
		expect(received[0]?.auth).toBe("Bearer sk_local");
		expect(received[0]?.body.subject).toBe(
			"Test Email (2026-10-03 19:06:09 UTC)",
		);
		expect(received[1]?.body.subject).toBe(
			"Test Email (2026-10-03 19:07:30 UTC)",
		);
		expect(received[0]?.body.to).toEqual(["team@example.com"]);
	});
});

const liveKey = process.env.SENDLY_LIVE_TEST_KEY;
const liveFrom = process.env.SENDLY_LIVE_TEST_FROM;
const liveTo = process.env.SENDLY_LIVE_TEST_TO;

/**
 * Sends two real test emails through Sendly. Opt-in: set SENDLY_LIVE_TEST_KEY,
 * SENDLY_LIVE_TEST_FROM (a verified sender) and SENDLY_LIVE_TEST_TO.
 */
describe.skipIf(!liveKey || !liveFrom || !liveTo)("Sendly live", () => {
	it("accepts two test emails in a row", async () => {
		const connection = {
			sendlyId: "live",
			apiKey: liveKey ?? "",
			fromAddress: liveFrom ?? "",
			toAddresses: [liveTo ?? ""],
			baseUrl: "https://app.sendly.now",
		};
		const first = buildSendlyTestEmail(new Date());
		await sendSendlyNotification(connection, first.subject, first.html);
		const second = buildSendlyTestEmail(new Date(Date.now() + 1000));
		await sendSendlyNotification(connection, second.subject, second.html);
		expect(second.subject).not.toBe(first.subject);
	}, 30_000);
});
