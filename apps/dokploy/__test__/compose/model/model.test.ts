import type { Compose, ComposeSpecification } from "@dokploy/server";
import {
	addAppNameToPreventCollision,
	addSuffixToAllProperties,
} from "@dokploy/server";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { expect, test, vi } from "vitest";
import { stringify } from "yaml";
import composeSpec from "../../../components/shared/compose-spec.json";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: vi.fn(),
}));

const modelCompose = {
	services: {
		app: {
			image: "my-chat-app",
			models: ["llm"],
		},
		worker: {
			image: "my-worker",
			models: {
				llm: {
					endpoint_var: "LLM_URL",
					model_var: "LLM_MODEL",
				},
			},
		},
	},
	models: {
		llm: {
			model: "ai/smollm2",
			context_size: 2048,
			runtime_flags: ["--verbose"],
		},
	},
} satisfies ComposeSpecification;

test("bundled compose schema declares models", () => {
	expect(composeSpec.properties).toHaveProperty("models");
	expect(composeSpec.definitions.model.required).toEqual(["model"]);
	expect(composeSpec.definitions.service.properties).toHaveProperty("models");
});

test("suffixing does not rename model identifiers or drop model config", () => {
	const updated = addSuffixToAllProperties(
		structuredClone(modelCompose),
		"testhash",
	);

	expect(updated.models?.llm?.model).toBe("ai/smollm2");
	expect(updated.models?.llm?.context_size).toBe(2048);
	expect(updated.models?.llm?.runtime_flags).toEqual(["--verbose"]);
	expect(updated.services?.["app-testhash"]?.models).toEqual(["llm"]);
	expect(updated.services?.["worker-testhash"]?.models).toEqual({
		llm: {
			endpoint_var: "LLM_URL",
			model_var: "LLM_MODEL",
		},
	});
	expect(updated.services).not.toHaveProperty("app");
	expect(updated.models).not.toHaveProperty("llm-testhash");
});

test("isolated deployment preserves model identifiers", () => {
	const updated = addAppNameToPreventCollision(
		structuredClone(modelCompose),
		"chat-app",
		false,
	);

	expect(updated.models?.llm?.model).toBe("ai/smollm2");
	expect(updated.services?.app?.models).toEqual(["llm"]);
	expect(updated.services?.worker?.models).toEqual({
		llm: {
			endpoint_var: "LLM_URL",
			model_var: "LLM_MODEL",
		},
	});
});

test("raw remote compose conversion preserves models", async () => {
	const converted = await addDomainToCompose(
		{
			appName: "chat-app",
			composeFile: stringify(modelCompose, { lineWidth: 1000 }),
			composePath: "./docker-compose.yml",
			composeType: "docker-compose",
			isolatedDeployment: false,
			isolatedDeploymentsVolume: false,
			randomize: false,
			serverId: "remote-server",
			sourceType: "raw",
			suffix: "",
		} as unknown as Compose,
		[],
	);

	expect(execAsyncRemote).not.toHaveBeenCalled();
	expect(converted?.models?.llm?.model).toBe("ai/smollm2");
	expect(converted?.services?.app?.models).toEqual(["llm"]);
	expect(converted?.services?.worker?.models).toEqual({
		llm: {
			endpoint_var: "LLM_URL",
			model_var: "LLM_MODEL",
		},
	});
});
