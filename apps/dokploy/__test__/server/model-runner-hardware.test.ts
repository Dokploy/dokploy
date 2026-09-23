import { parseModelRunnerCapability } from "@dokploy/server/services/model-runner";
import {
	ENGINE_INFO_ERROR,
	parseServerHardware,
} from "@dokploy/server/services/server-hardware";
import { expect, it } from "vitest";

it("preserves the shared Engine failure contract across capability endpoints", () => {
	const modelRunner = parseModelRunnerCapability(
		JSON.stringify({
			dockerPresent: true,
			engineExit: 1,
			engineBase64: "",
			pluginsExit: 0,
			pluginsBase64: Buffer.from('{"plugins":[],"errors":null}').toString(
				"base64",
			),
			containerStatus: "",
		}),
	);
	const hardware = parseServerHardware(
		JSON.stringify({ kind: "local", engineExit: 1 }),
	);
	expect(modelRunner.error).toBe(ENGINE_INFO_ERROR);
	expect(hardware.error).toBe(modelRunner.error);
});
