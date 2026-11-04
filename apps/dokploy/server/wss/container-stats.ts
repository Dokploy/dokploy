import { getLastAdvancedStatsFile, recordAdvancedStats } from "@dokploy/server/monitoring/utils";
import { openProcessStream } from "@dokploy/server/utils/process/remoteStream";
import { quote } from "shell-quote";
import { z } from "zod";

const cliStatsSchema = z.object({
  BlockIO: z.string(),
  CPUPerc: z.string(),
  Container: z.string(),
  ID: z.string(),
  MemPerc: z.string(),
  MemUsage: z.string(),
  Name: z.string(),
  NetIO: z.string(),
});

type ContainerStatsTarget = {
  containerId: string;
  statsKey: string;
  serverId?: string | null;
  signal?: AbortSignal;
};
export type ContainerStatsSample = Awaited<ReturnType<typeof getLastAdvancedStatsFile>>;

export async function collectContainerStats({
  containerId,
  statsKey,
  serverId = null,
  signal,
}: ContainerStatsTarget): Promise<ContainerStatsSample> {
  const command = `exec docker stats ${quote([containerId])} --no-stream --format '{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}'`;
  const process = await openProcessStream(serverId, command, signal);
  let stdout = "";
  let stderr = "";

  process.stdout.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });
  process.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  try {
    const code = await process.exit;

    signal?.throwIfAborted();

    if (code !== 0 || stderr) throw new Error("Docker stats command failed");

    const stat = cliStatsSchema.parse(JSON.parse(stdout));

    await recordAdvancedStats(stat, statsKey);

    return await getLastAdvancedStatsFile(statsKey);
  } finally {
    process.close();
  }
}
