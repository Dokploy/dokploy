import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildVectorConfigYaml,
	VECTOR_IMAGE,
} from "@dokploy/server/setup/vector-setup";
import { describe, expect, it } from "vitest";

const dockerAvailable = (() => {
	try {
		execFileSync("docker", ["info"], { stdio: "ignore", timeout: 10_000 });
		return true;
	} catch {
		return false;
	}
})();

const provider = (overrides: Record<string, unknown>) =>
	({
		apiKey: null,
		apiSecret: null,
		endpoint: null,
		extraConfig: null,
		enabled: true,
		...overrides,
	}) as any;

const logsOnly = [
	provider({
		telemetryProviderId: "loki1",
		name: "loki",
		providerType: "loki",
		signals: ["logs"],
		endpoint: "http://loki.example.com:3100",
		apiKey: "Pa$5w0rd$HOME",
		extraConfig: { username: "12345" },
	}),
];

const metricsOnly = [
	provider({
		telemetryProviderId: "prom1",
		name: "prom",
		providerType: "prometheus_remote_write",
		signals: ["metrics"],
		endpoint: "http://prom.example.com:9090/api/v1/write",
		apiKey: "token",
		extraConfig: { tenantId: "team-a" },
	}),
	provider({
		telemetryProviderId: "nr1",
		name: "new relic",
		providerType: "new_relic",
		signals: ["metrics"],
		apiKey: "license",
		extraConfig: { accountId: "123", region: "eu" },
	}),
	provider({
		telemetryProviderId: "influx1",
		name: "influx",
		providerType: "influxdb",
		signals: ["metrics"],
		endpoint: "http://influx.example.com:8086",
		apiKey: "token",
		extraConfig: { org: "dokploy", bucket: "metrics" },
	}),
];

const both = [
	provider({
		telemetryProviderId: "dd1",
		name: "datadog",
		providerType: "datadog",
		signals: ["logs", "metrics"],
		apiKey: "dd-key",
	}),
	provider({
		telemetryProviderId: "cw1",
		name: "cloudwatch",
		providerType: "aws_cloudwatch",
		signals: ["logs", "metrics"],
		apiKey: "AKIAFAKE",
		apiSecret: "secret",
		extraConfig: {
			region: "us-east-1",
			logGroup: "/dokploy/logs",
			metricsNamespace: "Dokploy",
		},
	}),
	provider({
		telemetryProviderId: "splunk1",
		name: "splunk",
		providerType: "splunk_hec",
		signals: ["logs", "metrics"],
		endpoint: "https://splunk.example.com:8088",
		apiKey: "hec",
		extraConfig: { index: "main", metricsIndex: "dokploy_metrics" },
	}),
	provider({
		telemetryProviderId: "es1",
		name: "elastic",
		providerType: "elasticsearch",
		signals: ["logs", "metrics"],
		endpoint: "http://es.example.com:9200",
		apiKey: "pw",
		extraConfig: { username: "elastic" },
	}),
	provider({
		telemetryProviderId: "bs1",
		name: "better stack",
		providerType: "betterstack",
		signals: ["logs", "metrics"],
		endpoint: "in.logs.betterstack.com",
		apiKey: "token",
	}),
];

const cases: Array<[string, Parameters<typeof buildVectorConfigYaml>[0]]> = [
	[
		"local logs only",
		{
			logProviders: logsOnly,
			metricsProviders: [],
			organizationId: "org_a",
			serverName: "Dokploy Server (local)",
		},
	],
	[
		"local metrics only",
		{
			logProviders: [],
			metricsProviders: metricsOnly,
			organizationId: "org_a",
			serverName: "Dokploy Server (local)",
		},
	],
	[
		"local every provider on both signals",
		{
			logProviders: [...logsOnly, ...both],
			metricsProviders: [...metricsOnly, ...both],
			organizationId: "org_a",
			serverName: 'Dokploy "Server" $HOSTNAME (local)',
		},
	],
	[
		"remote metrics only",
		{ logProviders: [], metricsProviders: metricsOnly, serverName: "edge-1" },
	],
	[
		"remote every provider on both signals",
		{
			logProviders: [...logsOnly, ...both],
			metricsProviders: [...metricsOnly, ...both],
			serverName: "edge-1",
		},
	],
];

describe.skipIf(!dockerAvailable)(
	"vector validate on generated configs",
	() => {
		const dir = mkdtempSync(path.join(os.tmpdir(), "vector-validate-"));

		it.each(cases)(
			"%s",
			(name, input) => {
				const file = path.join(dir, `${name.replace(/\W+/g, "-")}.yaml`);
				writeFileSync(file, buildVectorConfigYaml(input));
				const output = execFileSync(
					"docker",
					[
						"run",
						"--rm",
						"-v",
						"/var/run/docker.sock:/var/run/docker.sock:ro",
						"-v",
						`${file}:/etc/vector/vector.yaml:ro`,
						VECTOR_IMAGE,
						"validate",
						"--skip-healthchecks",
						"/etc/vector/vector.yaml",
					],
					{
						encoding: "utf8",
						stdio: ["ignore", "pipe", "pipe"],
						timeout: 120_000,
					},
				);
				expect(output).toContain("Validated");
			},
			150_000,
		);
	},
);
