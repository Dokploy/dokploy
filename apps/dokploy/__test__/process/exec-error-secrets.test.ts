import { inspect } from "node:util";
import { execAsync, ExecError } from "@dokploy/server/utils/process/execAsync";
import { describe, expect, it } from "vitest";

describe("execAsync failure", () => {
	it("does not leak secrets embedded in the command", async () => {
		const secret = "s3cr3t-value";
		const error = await execAsync(`printf %s '${secret}' >/dev/null; exit 3`)
			.then(() => null)
			.catch((e) => e);

		expect(error).toBeInstanceOf(ExecError);
		expect(error.exitCode).toBe(3);
		expect(error.message).not.toContain(secret);
		expect(inspect(error)).not.toContain(secret);
	});
});
