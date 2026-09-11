import type { Compose, ComposeSpecification } from "@dokploy/server";
import {
	addAppNameToPreventCollision,
	addSuffixToAllProperties,
} from "@dokploy/server";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { expect, test, vi } from "vitest";
import { parse, stringify } from "yaml";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: vi.fn(),
}));

const modelsComposeFile = `
services:
  chat:
    image: my-chat-app
    models:
      - llm
  worker:
    image: my-worker
    models:
      embed:
        endpoint_var: EMBED_URL
        model_var: EMBED_MODEL
models:
  llm:
    model: ai/smollm2
    context_size: 2048
    runtime_flags:
      - "--verbose"
  embed:
    model: ai/all-minilm
    name: embeddings
`;

const expectedModels = {
	llm: {
		model: "ai/smollm2",
		context_size: 2048,
		runtime_flags: ["--verbose"],
	},
	embed: {
		model: "ai/all-minilm",
		name: "embeddings",
	},
};

const expectedChatModels = ["llm"];
const expectedWorkerModels = {
	embed: {
		endpoint_var: "EMBED_URL",
		model_var: "EMBED_MODEL",
	},
};

const assertModelsPreserved = (
	spec: ComposeSpecification | null,
	serviceNames: { chat: string; worker: string } = {
		chat: "chat",
		worker: "worker",
	},
) => {
	expect(spec?.models).toEqual(expectedModels);
	expect(spec?.services?.[serviceNames.chat]?.models).toEqual(
		expectedChatModels,
	);
	expect(spec?.services?.[serviceNames.worker]?.models).toEqual(
		expectedWorkerModels,
	);
};

const rawCompose = (overrides?: Record<string, unknown>) =>
	({
		appName: "chat-app",
		composeFile: modelsComposeFile,
		composePath: "./docker-compose.yml",
		composeType: "docker-compose",
		isolatedDeployment: false,
		isolatedDeploymentsVolume: false,
		randomize: false,
		serverId: null,
		sourceType: "raw",
		suffix: "",
		...overrides,
	}) as unknown as Compose;

test("compose without models is unchanged besides existing suffix behavior", () => {
	const composeData = parse(`
services:
  web:
    image: nginx:latest
    volumes:
      - web_data:/data
volumes:
  web_data:
`) as ComposeSpecification;
	const updated = addSuffixToAllProperties(composeData, "testhash");

	expect(updated.models).toBeUndefined();
	expect(updated.services).toEqual({
		"web-testhash": {
			image: "nginx:latest",
			volumes: ["web_data-testhash:/data"],
		},
	});
	expect(updated.volumes).toEqual({
		"web_data-testhash": null,
	});
});

test("suffixing does not rename model identifiers or drop model config", () => {
	const updated = addSuffixToAllProperties(
		parse(modelsComposeFile) as ComposeSpecification,
		"testhash",
	);

	assertModelsPreserved(updated, {
		chat: "chat-testhash",
		worker: "worker-testhash",
	});
	expect(updated.services).not.toHaveProperty("chat");
	expect(updated.models).not.toHaveProperty("llm-testhash");
});

test("isolated deployment preserves model identifiers", () => {
	assertModelsPreserved(
		addAppNameToPreventCollision(
			parse(modelsComposeFile) as ComposeSpecification,
			"chat-app",
			false,
		),
	);
});

test("raw remote compose conversion preserves models", async () => {
	vi.mocked(execAsyncRemote).mockResolvedValue({
		stdout: "services:\n  dropped:\n    image: alpine:latest\n",
		stderr: "",
	});

	const converted = await addDomainToCompose(
		rawCompose({ serverId: "remote-server" }),
		[],
	);

	assertModelsPreserved(converted);
	expect(execAsyncRemote).not.toHaveBeenCalled();

	const written = parse(
		stringify(converted, { lineWidth: 1000 }),
	) as ComposeSpecification;
	assertModelsPreserved(written);
});

test("invalid YAML still fails at parse", async () => {
	await expect(
		addDomainToCompose(rawCompose({ composeFile: "services: [" }), []),
	).rejects.toThrow();
});
