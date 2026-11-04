import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { getAdvancedStats } from "@dokploy/server/monitoring/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectContainerStats } from "@/server/wss/container-stats";

const boundary = vi.hoisted(() => ({
  monitoringPath: "",
  openProcessStream: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
  paths: () => ({ MONITORING_PATH: boundary.monitoringPath }),
}));
vi.mock("@dokploy/server/utils/process/remoteStream", () => ({
  openProcessStream: boundary.openProcessStream,
}));

const containerId = "a".repeat(64);
const timestamp = "2026-11-04T12:00:00.000Z";
const cliSample = {
  CPUPerc: "20.50%",
  MemUsage: "12.5MiB / 1GiB",
  MemPerc: "1.22%",
  BlockIO: "1.25MB / 512kB",
  NetIO: "2.5GB / 42B",
  Container: containerId,
  ID: containerId,
  Name: "stack-api.1.task",
};

function processOutput(stdout: string, code = 0, stderr = "") {
  const output = Readable.from([stdout]);

  return {
    stdin: new PassThrough(),
    stdout: output,
    stderr: Readable.from([stderr]),
    exit: new Promise<number>((resolve) => output.once("end", () => resolve(code))),
    close: vi.fn(),
  };
}

beforeEach(async () => {
  vi.resetAllMocks();
  boundary.monitoringPath = await mkdtemp(join(tmpdir(), "dokploy-container-stats-"));
  boundary.openProcessStream.mockImplementation(async () =>
    processOutput(JSON.stringify(cliSample)),
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(timestamp));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(boundary.monitoringPath, { recursive: true, force: true });
});

describe("container metrics parity", () => {
  it("uses the same collection, units, and stored metrics on the local server and a worker", async () => {
    const signal = new AbortController().signal;
    const local = await collectContainerStats({ containerId, statsKey: "local", signal });
    const worker = await collectContainerStats({
      containerId,
      statsKey: "worker",
      serverId: "registered-worker",
      signal,
    });

    expect(worker).toEqual(local);
    expect(worker).toEqual({
      cpu: { time: timestamp, value: "20.50%" },
      memory: { time: timestamp, value: { used: "12.5MiB", total: "1GiB" } },
      block: { time: timestamp, value: { readMb: 1.25, writeMb: 0.512 } },
      network: { time: timestamp, value: { inputMb: 2500, outputMb: 0.000042 } },
      disk: null,
    });
    expect(await getAdvancedStats("worker")).toEqual(await getAdvancedStats("local"));
    expect((await getAdvancedStats("worker")).cpu).toHaveLength(1);
    const [localCall, workerCall] = boundary.openProcessStream.mock.calls;

    expect(localCall?.[0]).toBeNull();
    expect(workerCall?.[0]).toBe("registered-worker");
    expect(workerCall?.[1]).toBe(localCall?.[1]);
    expect(workerCall?.[2]).toBe(signal);
    expect(workerCall?.[1]).toContain(containerId);
  });

  it("keeps idle metrics and binary I/O units compatible with the existing charts", async () => {
    boundary.openProcessStream.mockResolvedValue(
      processOutput(
        JSON.stringify({
          ...cliSample,
          CPUPerc: "0.00%",
          MemUsage: "0B / 64MiB",
          BlockIO: "1MiB / 2KiB",
          NetIO: "0B / 0B",
        }),
      ),
    );

    const sample = await collectContainerStats({
      containerId,
      statsKey: "idle",
      serverId: "worker",
    });

    expect(sample.cpu.value).toBe("0.00%");
    expect(sample.memory.value).toEqual({ used: "0B", total: "64MiB" });
    expect(sample.block.value).toEqual({ readMb: 1.048576, writeMb: 0.002048 });
    expect(sample.network.value).toEqual({ inputMb: 0, outputMb: 0 });
    expect(sample.disk).toBeNull();
  });

  it.each([
    { stdout: "not JSON", code: 0 },
    { stdout: JSON.stringify({ CPUPerc: "20%" }), code: 0 },
    { stdout: JSON.stringify(cliSample), code: 1 },
  ])("does not record failed or incomplete samples: %j", async ({ stdout, code }) => {
    boundary.openProcessStream.mockResolvedValue(processOutput(stdout, code));

    await expect(collectContainerStats({ containerId, statsKey: "failed" })).rejects.toThrow();

    expect(await getAdvancedStats("failed")).toEqual({
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      block: [],
    });
  });
});
