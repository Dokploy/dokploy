import { execFileSync } from "node:child_process";

export const REAL_TEST_TIMEOUT = 180_000;

const swarmActive = (() => {
	try {
		return (
			execFileSync("docker", ["info", "--format", "{{.Swarm.LocalNodeState}}"])
				.toString()
				.trim() === "active"
		);
	} catch {
		return false;
	}
})();

// CI always provides a swarm, so a missing one there should fail loudly
// instead of skipping.
export const runRealSwarmTests = !!process.env.CI || swarmActive;

export const waitFor = async <T>(
	read: () => Promise<T>,
	done: (value: T) => boolean,
	timeoutMs = 120_000,
): Promise<T> => {
	const deadline = Date.now() + timeoutMs;
	let value = await read();
	while (!done(value) && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		value = await read();
	}
	return value;
};
