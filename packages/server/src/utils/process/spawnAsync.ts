import {
	type ChildProcess,
	type SpawnOptions,
	spawn,
} from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import BufferList from "bl";

export const spawnAsync = (
	command: string,
	args?: string[] | undefined,
	onData?: (data: string) => void, // Callback opcional para manejar datos en tiempo real
	options?: SpawnOptions,
): Promise<BufferList> & { child: ChildProcess } => {
	const child = spawn(command, args ?? [], options ?? {});
	const stdout = child.stdout ? new BufferList() : new BufferList();
	const stderr = child.stderr ? new BufferList() : new BufferList();

	const stdoutDecoder = new StringDecoder("utf8");
	const stderrDecoder = new StringDecoder("utf8");

	if (child.stdout) {
		child.stdout.on("data", (data) => {
			stdout.append(data);
			if (onData) {
				onData(stdoutDecoder.write(data));
			}
		});
		child.stdout.on("end", () => {
			const tail = stdoutDecoder.end();
			if (onData && tail.length) {
				onData(tail);
			}
		});
	}
	if (child.stderr) {
		child.stderr.on("data", (data) => {
			stderr.append(data);
			if (onData) {
				onData(stderrDecoder.write(data));
			}
		});
		child.stderr.on("end", () => {
			const tail = stderrDecoder.end();
			if (onData && tail.length) {
				onData(tail);
			}
		});
	}

	const promise = new Promise<BufferList>((resolve, reject) => {
		child.on("error", reject);

		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
			} else {
				const err = new Error(`${stderr.toString()}`) as Error & {
					code: number;
					stderr: BufferList;
					stdout: BufferList;
				};
				err.code = code || -1;
				err.stderr = stderr;
				err.stdout = stdout;
				reject(err);
			}
		});
	}) as Promise<BufferList> & { child: ChildProcess };

	promise.child = child;

	return promise;
};
