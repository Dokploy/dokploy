import {
	fetchTemplateFiles,
	fetchTemplatesList,
} from "@dokploy/server/templates/github";
import { afterEach, describe, expect, it, vi } from "vitest";

const metadata = [
	{
		id: "postgres",
		name: "Postgres",
		description: "Postgres database",
		version: "1.0.0",
		logo: "logo.svg",
		links: {
			github: "https://github.com/example/postgres",
		},
		tags: ["database"],
	},
];

const templateToml = `
[metadata]
id = "postgres"
name = "Postgres"
description = "Postgres database"
version = "1.0.0"
logo = "logo.svg"
tags = ["database"]

[metadata.links]
github = "https://github.com/example/postgres"

[variables]
POSTGRES_PASSWORD = "password"

[config]
isolated = true

[config.env]
POSTGRES_PASSWORD = "\${POSTGRES_PASSWORD}"

[[config.domains]]
serviceName = "postgres"
port = 5432
`;

const publicLookup = async () => [{ address: "8.8.8.8", family: 4 }];

describe("template GitHub base URL boundary", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		["plain HTTP localhost", "http://127.0.0.1:3000"],
		["loopback IP", "https://127.0.0.1"],
		["integer loopback IP", "https://2130706433"],
		["IPv6 loopback IP", "https://[::1]"],
		["IPv6 mapped loopback IP", "https://[::ffff:127.0.0.1]"],
		["IPv6 link-local IP", "https://[fe80::1]"],
		["IPv6 upper link-local IP", "https://[febf::1]"],
		["link-local metadata IP", "https://169.254.169.254/latest"],
		["URL credentials", "https://user:pass@templates.example.com"],
		["path-prefixed source", "https://templates.example.com/custom"],
		["query-prefixed source", "https://templates.example.com?token=secret"],
	])("rejects unsafe %s before fetching templates", async (_name, baseUrl) => {
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify(metadata), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(fetchTemplatesList(baseUrl)).rejects.toThrow(
			/template base URL/i,
		);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("normalizes safe HTTPS template list sources", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify(metadata), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			fetchTemplatesList("https://templates.example.com/", {
				lookup: publicLookup,
			}),
		).resolves.toEqual(metadata);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://templates.example.com/meta.json",
			expect.objectContaining({
				redirect: "error",
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("rejects public-looking template sources that resolve to private addresses before fetching", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify(metadata), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			fetchTemplatesList("https://templates.example.com/", {
				lookup: async () => [{ address: "10.0.0.10", family: 4 }],
			}),
		).rejects.toThrow(/template base URL/i);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects unsafe template file sources before fetching", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(templateToml, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			fetchTemplateFiles("postgres", "https://127.0.0.1"),
		).rejects.toThrow(/template base URL/i);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("normalizes safe HTTPS template file sources", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(templateToml, { status: 200 }))
			.mockResolvedValueOnce(
				new Response("services:\n  postgres:\n    image: postgres\n", {
					status: 200,
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			fetchTemplateFiles("postgres", "https://templates.example.com/", {
				lookup: publicLookup,
			}),
		).resolves.toMatchObject({
			dockerCompose: "services:\n  postgres:\n    image: postgres\n",
		});

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"https://templates.example.com/blueprints/postgres/template.toml",
			expect.objectContaining({
				redirect: "error",
				signal: expect.any(AbortSignal),
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"https://templates.example.com/blueprints/postgres/docker-compose.yml",
			expect.objectContaining({
				redirect: "error",
				signal: expect.any(AbortSignal),
			}),
		);
	});
});
