import type { WriteStream } from "node:fs";
import { spawnAsync } from "../process/spawnAsync";
import type { ApplicationNested } from ".";
import { getBuildAppDirectory } from "../filesystem/directory";
import { prepareEnvironmentVariables } from "../docker/utils";

// TODO: integrate in the vps sudo chown -R $(whoami) ~/.docker
export const buildPaketo = async (
  application: ApplicationNested,
  writeStream: WriteStream,
) => {
  const { env, appName } = application;
  const buildAppDirectory = getBuildAppDirectory(application);
  const envVariables = prepareEnvironmentVariables(env);
  try {
    const args = [
      "build",
      appName,
      "--path",
      buildAppDirectory,
      "--builder",
      "paketobuildpacks/builder-jammy-full",
    ];

    for (const env in envVariables) {
      args.push("--env", env);
    }

    await spawnAsync("pack", args, (data) => {
      if (writeStream.writable) {
        writeStream.write(data);
      }
    });
    return true;
  } catch (e) {
    throw e;
  }
};
