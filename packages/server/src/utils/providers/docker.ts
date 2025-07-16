import { createWriteStream } from "node:fs";
import { type ApplicationNested, mechanizeDockerContainer } from "../builders";
import { pullImage } from "../docker/utils";

interface RegistryAuth {
	username: string;
	password: string;
	registryUrl: string;
}

interface RegistryConfig {
	registryUrl: string;
	imagePrefix?: string | null;
	username: string;
	password: string;
}

export const buildRegistryDockerImage = (
	registryConfig: RegistryConfig,
	imageName: string,
	imageTag: string,
): string => {
	// Remove protocol from registry URL for Docker image name
	const registryHost = registryConfig.registryUrl.replace(/^https?:\/\//, "");

	return registryConfig.imagePrefix && registryConfig.imagePrefix.trim()
		? `${registryHost}/${registryConfig.imagePrefix}/${imageName}:${imageTag}`
		: `${registryHost}/${imageName}:${imageTag}`;
};

export const buildDocker = async (
	application: ApplicationNested,
	logPath: string,
): Promise<void> => {
	const { buildType, dockerImage, username, password } = application;
	const authConfig: Partial<RegistryAuth> = {
		username: username || "",
		password: password || "",
		registryUrl: application.registryUrl || "",
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
					writeStream.write(`${data}\n`);
				}
			},
			authConfig,
		);
		await mechanizeDockerContainer(application);
		writeStream.write("\nDocker Deployed: ✅\n");
	} catch (error) {
		writeStream.write("❌ Error");
		throw error;
	} finally {
		writeStream.end();
	}
};

export const buildRemoteDocker = async (
	application: ApplicationNested,
	logPath: string,
) => {
	const { registryUrl, dockerImage, username, password } = application;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}
		let command = `
echo "Pulling ${dockerImage}" >> ${logPath};		
		`;

		if (username && password) {
			command += `
if ! echo "${password}" | docker login --username "${username}" --password-stdin "${registryUrl || ""}" >> ${logPath} 2>&1; then
	echo "❌ Login failed" >> ${logPath};
	exit 1;
fi
`;
		}

		command += `
docker pull ${dockerImage} >> ${logPath} 2>> ${logPath} || { 
  echo "❌ Pulling image failed" >> ${logPath};
  exit 1;
}

echo "✅ Pulling image completed." >> ${logPath};
`;
		return command;
	} catch (error) {
		throw error;
	}
};

export const buildRegistry = async (
	application: ApplicationNested,
	logPath: string,
): Promise<void> => {
	const { deployRegistry, deployImage, deployImageTag } = application;

	if (!deployRegistry || !deployImage || !deployImageTag) {
		throw new Error("Registry, image, or tag not found");
	}

	const dockerImage = buildRegistryDockerImage(
		deployRegistry,
		deployImage,
		deployImageTag,
	);

	const authConfig: Partial<RegistryAuth> = {
		username: deployRegistry.username,
		password: deployRegistry.password,
		registryUrl: deployRegistry.registryUrl,
	};

	const writeStream = createWriteStream(logPath, { flags: "a" });

	writeStream.write(
		`\nDeploying from Registry: ${deployRegistry.registryName}\n`,
	);
	writeStream.write(`Image: ${dockerImage}\n`);
	writeStream.write("Pulling image: ✅\n");

	try {
		await pullImage(
			dockerImage,
			(data) => {
				if (writeStream.writable) {
					writeStream.write(`${data}\n`);
				}
			},
			authConfig,
		);

		// Update the application with the resolved image for container creation
		const updatedApplication = {
			...application,
			dockerImage,
		};

		await mechanizeDockerContainer(updatedApplication);
		writeStream.write("\nRegistry Deployment Complete: ✅\n");
	} catch (error) {
		writeStream.write("❌ Error");
		throw error;
	} finally {
		writeStream.end();
	}
};

export const buildRemoteRegistry = async (
	application: ApplicationNested,
	logPath: string,
) => {
	const { deployRegistry, deployImage, deployImageTag } = application;

	if (!deployRegistry || !deployImage || !deployImageTag) {
		throw new Error("Registry, image, or tag not found");
	}

	const dockerImage = buildRegistryDockerImage(
		deployRegistry,
		deployImage,
		deployImageTag,
	);

	try {
		let command = `
echo "Deploying from Registry: ${deployRegistry.registryName}" >> ${logPath};
echo "Image: ${dockerImage}" >> ${logPath};
echo "Pulling image from registry" >> ${logPath};
		`;

		// Add registry login
		command += `
if ! echo "${deployRegistry.password}" | docker login --username "${deployRegistry.username}" --password-stdin "${deployRegistry.registryUrl}" >> ${logPath} 2>&1; then
	echo "❌ Registry login failed" >> ${logPath};
	exit 1;
fi
`;

		command += `
docker pull ${dockerImage} >> ${logPath} 2>> ${logPath} || { 
  echo "❌ Pulling image from registry failed" >> ${logPath};
  exit 1;
}

echo "✅ Registry deployment completed." >> ${logPath};
`;
		return command;
	} catch (error) {
		throw error;
	}
};
