export async function* streamRestoreLogs(
	runRestore: (onLog: (log: string) => void) => Promise<void>,
	signal?: AbortSignal,
): AsyncGenerator<string> {
	const queue: string[] = [];
	let done = false;
	let failed = false;
	let failure: unknown;
	const onLog = (log: string) => queue.push(log);
	runRestore(onLog)
		.catch((error) => {
			failed = true;
			failure = error;
			onLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
		})
		.finally(() => {
			done = true;
		});
	while (!done || queue.length > 0) {
		if (queue.length > 0) {
			yield queue.shift()!;
		} else {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		if (signal?.aborted) {
			return;
		}
	}
	if (failed) {
		throw failure;
	}
}
