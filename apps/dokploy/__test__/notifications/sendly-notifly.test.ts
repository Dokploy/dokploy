import {
	sendNotiflyNotification,
	sendSendlyNotification,
} from "@dokploy/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sendSendlyNotification", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("posts to the Sendly emails endpoint with a bearer token", async () => {
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, data: {} }),
		});

		await sendSendlyNotification(
			{
				sendlyId: "sendly-1",
				apiKey: "sk_test123",
				fromAddress: "alerts@example.com",
				toAddresses: ["team@example.com"],
				baseUrl: "https://app.sendly.now",
			},
			"Test Email",
			"<p>Hi, From Dokploy</p>",
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0]!;
		expect(url).toBe("https://app.sendly.now/api/emails");
		expect(options?.method).toBe("POST");
		expect(options?.headers).toMatchObject({
			"Content-Type": "application/json",
			Authorization: "Bearer sk_test123",
		});
		expect(JSON.parse(options?.body as string)).toEqual({
			from: "alerts@example.com",
			to: ["team@example.com"],
			subject: "Test Email",
			body: "<p>Hi, From Dokploy</p>",
		});
	});

	it("falls back to the default base URL when none is provided", async () => {
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, data: {} }),
		});

		await sendSendlyNotification(
			{
				sendlyId: "sendly-1",
				apiKey: "sk_test123",
				fromAddress: "alerts@example.com",
				toAddresses: ["team@example.com"],
				baseUrl: "",
			},
			"Subject",
			"body",
		);

		const [url] = fetchMock.mock.calls[0]!;
		expect(url).toBe("https://app.sendly.now/api/emails");
	});

	it("throws with the API error message when the request fails", async () => {
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue({
			ok: false,
			statusText: "Unauthorized",
			json: async () => ({ error: { message: "Invalid API key" } }),
		});

		await expect(
			sendSendlyNotification(
				{
					sendlyId: "sendly-1",
					apiKey: "sk_bad",
					fromAddress: "alerts@example.com",
					toAddresses: ["team@example.com"],
					baseUrl: "https://app.sendly.now",
				},
				"Subject",
				"body",
			),
		).rejects.toThrow("Invalid API key");
	});
});

describe("sendNotiflyNotification", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("posts to the Notifly events trigger endpoint with an ApiKey header", async () => {
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

		await sendNotiflyNotification(
			{
				notiflyId: "notifly-1",
				apiKey: "ntf_test123",
				workflowKey: "dokploy-alerts",
				subscriberId: "dokploy",
				baseUrl: "https://api.notifly.io",
			},
			{ event: "test", message: "Hi, From Dokploy" },
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0]!;
		expect(url).toBe("https://api.notifly.io/v1/events/trigger");
		expect(options?.method).toBe("POST");
		expect(options?.headers).toMatchObject({
			"Content-Type": "application/json",
			Authorization: "ApiKey ntf_test123",
		});
		expect(JSON.parse(options?.body as string)).toEqual({
			name: "dokploy-alerts",
			to: "dokploy",
			payload: { event: "test", message: "Hi, From Dokploy" },
		});
	});

	it("defaults the subscriber id to dokploy when none is set", async () => {
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

		await sendNotiflyNotification(
			{
				notiflyId: "notifly-1",
				apiKey: "ntf_test123",
				workflowKey: "dokploy-alerts",
				subscriberId: null,
				baseUrl: "https://api.notifly.io",
			},
			{ event: "test" },
		);

		const [, options] = fetchMock.mock.calls[0]!;
		expect(JSON.parse(options?.body as string).to).toBe("dokploy");
	});

	it("throws when the Notifly API responds with a non-ok status", async () => {
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue({
			ok: false,
			statusText: "Forbidden",
			text: async () => "invalid api key",
		});

		await expect(
			sendNotiflyNotification(
				{
					notiflyId: "notifly-1",
					apiKey: "ntf_bad",
					workflowKey: "dokploy-alerts",
					subscriberId: "dokploy",
					baseUrl: "https://api.notifly.io",
				},
				{ event: "test" },
			),
		).rejects.toThrow("Forbidden");
	});

	const failWith = async (response: Record<string, unknown>) => {
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue({ ok: false, ...response });
		const error = await sendNotiflyNotification(
			{
				notiflyId: "notifly-1",
				apiKey: "ntf_bad",
				workflowKey: "dokploy-alerts",
				subscriberId: "dokploy",
				baseUrl: "https://api.notifly.io",
			},
			{ event: "test" },
		).catch((e: Error) => e);
		return (error as Error).message;
	};

	it("turns a rejected key into one short readable line (no raw JSON, no repeat)", async () => {
		const message = await failWith({
			status: 401,
			statusText: "Unauthorized",
			text: async () =>
				JSON.stringify({
					message: "API Key not found",
					error: "Unauthorized",
					statusCode: 401,
				}),
		});
		expect(message).toBe("Notifly rejected the API key (API Key not found)");
		expect(message).not.toContain("{");
		expect(message.match(/Notifly/g)).toHaveLength(1);
	});

	it("reads message lists, nested error messages and plain text", async () => {
		expect(
			await failWith({
				status: 400,
				statusText: "Bad Request",
				text: async () =>
					JSON.stringify({
						message: ["name must be a string", "to must not be empty"],
					}),
			}),
		).toBe(
			"Notifly request failed (400 Bad Request): name must be a string, to must not be empty",
		);
		expect(
			await failWith({
				status: 404,
				statusText: "Not Found",
				text: async () =>
					JSON.stringify({ error: { message: "Workflow not found" } }),
			}),
		).toBe("Notifly request failed (404 Not Found): Workflow not found");
		expect(
			await failWith({
				status: 502,
				statusText: "Bad Gateway",
				text: async () => "upstream down",
			}),
		).toBe("Notifly request failed (502 Bad Gateway): upstream down");
	});

	it("caps a long upstream message and survives an empty body", async () => {
		const long = await failWith({
			status: 500,
			statusText: "Internal Server Error",
			text: async () => JSON.stringify({ message: "x".repeat(5000) }),
		});
		expect(long.length).toBeLessThan(260);
		expect(long.endsWith("…")).toBe(true);
		expect(
			await failWith({
				status: 401,
				statusText: "Unauthorized",
				text: async () => "",
			}),
		).toBe("Notifly rejected the API key");
	});

	it("says Notifly could not be reached when the request itself fails", async () => {
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
		await expect(
			sendNotiflyNotification(
				{
					notiflyId: "notifly-1",
					apiKey: "ntf_bad",
					workflowKey: "dokploy-alerts",
					subscriberId: "dokploy",
					baseUrl: "https://api.notifly.io",
				},
				{ event: "test" },
			),
		).rejects.toThrow("Could not reach Notifly: getaddrinfo ENOTFOUND");
	});
});
