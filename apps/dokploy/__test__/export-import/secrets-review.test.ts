import type { Snapshot } from "@dokploy/server/services/project-export-import";
import { listReviewableSecrets } from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const snapshot = {
	resources: {
		project: {},
		environments: [],
		services: [
			{
				kind: "application",
				applicationId: "app-1",
				name: "web",
				security: [
					{ username: "admin", password: "$secret:sec-1" },
					{ username: "plain", password: "not-a-ref" },
				],
			},
			{ kind: "postgres", postgresId: "pg-1", databasePassword: "$secret:pg" },
		],
		shared: {
			registry: [{ registryName: "ghcr", password: "$secret:reg-1" }],
			destination: [
				{
					name: "backups",
					accessKey: "$secret:ak-1",
					secretAccessKey: "$secret:sk-1",
				},
			],
			sshKey: [{ name: "deploy", privateKey: "$secret:ssh-1" }],
			certificate: [{ name: "wildcard", privateKey: "$secret:cert-1" }],
		},
	},
} as unknown as Snapshot;

describe("listReviewableSecrets", () => {
	it("lists external credentials by secret ref, skipping database passwords and non-refs", () => {
		const entries = listReviewableSecrets(snapshot);
		expect(
			entries.map((e) => [e.kind, e.resource, e.field, e.secretId]),
		).toEqual([
			["basicAuth", "web · admin", "password", "sec-1"],
			["registry", "ghcr", "password", "reg-1"],
			["destination", "backups", "accessKey", "ak-1"],
			["destination", "backups", "secretAccessKey", "sk-1"],
			["sshKey", "deploy", "privateKey", "ssh-1"],
			["certificate", "wildcard", "privateKey", "cert-1"],
		]);
		expect(entries.filter((e) => e.generatable).map((e) => e.kind)).toEqual([
			"basicAuth",
		]);
	});
});
