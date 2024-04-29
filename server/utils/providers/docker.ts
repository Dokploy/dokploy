import { createWriteStream } from "node:fs";
import { type ApplicationNested, mechanizeDockerContainer } from "../builders";
import { pullImage } from "../docker/utils";

interface RegistryAuth {
  username: string;
  password: string;
  serveraddress: string;
}

export const buildDocker = async (
  application: ApplicationNested,
  logPath: string,
): Promise<void> => {
  const { buildType, dockerImage, username, password } = application;
  const authConfig: Partial<RegistryAuth> = {
    username: username || "",
    password: password || "",
  };

  const writeStream = createWriteStream(logPath, { flags: "a" });

  writeStream.write(`\nBuild ${buildType}\n`);

  writeStream.write(`Pulling ${dockerImage}: ✅\n`);

  try {
    if (!dockerImage) {
      throw new Error("Docker image not found");
    }

    await pullImage(
      dockerImage,
      (data) => {
        if (writeStream.writable) {
          writeStream.write(`${data.status}\n`);
        }
      },
      authConfig,
    );
    await mechanizeDockerContainer(application);
    writeStream.write("\nDocker Deployed: ✅\n");
  } catch (error) {
    writeStream.write(`ERROR: ${error}: ❌`);
    throw error;
  } finally {
    writeStream.end();
  }
};
