import { spawn } from "node:child_process";
import { findServerById } from "@dokploy/server/services/server";
import { Client, type ClientChannel } from "ssh2";
import { sshKeepalive } from "./execAsync";

export interface ProcessStream {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  exit: Promise<number>;
  close: () => void;
}

export const openProcessStream = async (
  serverId: string | null,
  command: string,
  signal?: AbortSignal,
): Promise<ProcessStream> => {
  signal?.throwIfAborted();

  if (!serverId) {
    const child = spawn("sh", ["-c", command], { signal });
    const exit = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });

    return {
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      exit,
      close: () => child.kill(),
    };
  }

  const server = await findServerById(serverId);

  signal?.throwIfAborted();

  if (!server.sshKeyId) throw new Error("No SSH key available for this server");

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let channel: ClientChannel | undefined;
    let finishExit: ((code: number) => void) | undefined;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new Error("Remote command aborted"));
      finishExit?.(1);
      channel?.signal("KILL");
      channel?.close();
      conn.destroy();
    };

    signal?.addEventListener("abort", abort, { once: true });
    conn.once("close", () => {
      cleanup();
      finishExit?.(1);
      reject(new Error("SSH connection closed"));
    });
    conn
      .once("ready", () => {
        if (signal?.aborted) return;

        conn.exec(command, (err, stream) => {
          if (signal?.aborted) {
            stream?.close();

            return;
          }

          if (err) {
            cleanup();
            reject(err);
            conn.end();

            return;
          }

          channel = stream;
          let exitCode = 1;

          stream.once("exit", (code: number | null) => {
            exitCode = code ?? 1;
          });
          const exit = new Promise<number>((resolveExit) => {
            finishExit = resolveExit;
            stream.once("close", () => {
              cleanup();
              resolveExit(exitCode);
              conn.end();
            });
          });

          resolve({
            stdin: stream,
            stdout: stream,
            stderr: stream.stderr,
            exit,
            close: () => {
              stream.close();
              conn.end();
            },
          });
        });
      })
      .once("error", (err) => {
        cleanup();
        finishExit?.(1);
        reject(err);
        conn.end();
      })
      .connect({
        host: server.ipAddress,
        port: server.port,
        username: server.username,
        privateKey: server.sshKey?.privateKey,
        readyTimeout: 30_000,
        ...sshKeepalive,
      });
  });
};

const collectOutput = (stream: NodeJS.ReadableStream) => {
  const chunks: string[] = [];

  stream.on("data", (chunk) => chunks.push(chunk.toString()));

  return () => chunks.join("").trim();
};

type ProcessTarget = { serverId: string | null; command: string };
type PipeOptions = {
  source: ProcessTarget;
  target: ProcessTarget;
  onProgress?: (bytes: number) => void;
};

export const pipeBetweenServers = async ({ source, target, onProgress }: PipeOptions) => {
  const to = await openProcessStream(target.serverId, target.command);
  const targetError = collectOutput(to.stderr);

  to.stdout.resume();
  to.stdin.on("error", () => {});

  const from = await openProcessStream(source.serverId, source.command);
  const sourceError = collectOutput(from.stderr);
  let bytes = 0;

  from.stdout.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    onProgress?.(bytes);
  });
  from.stdout.on("error", () => {});
  from.stdout.pipe(to.stdin);

  const targetExit = to.exit.then((code) => {
    if (code !== 0) from.close();

    return code;
  });

  const [sourceCode, targetCode] = await Promise.all([from.exit, targetExit]);

  const failures = [
    sourceCode !== 0 && `source exited with code ${sourceCode}: ${sourceError()}`,
    targetCode !== 0 && `target exited with code ${targetCode}: ${targetError()}`,
  ].filter(Boolean);

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  return bytes;
};
