import { quoteShellArgs } from "../shell";

export const buildDockerPullCommand = (dockerImage: string) => {
	if (!dockerImage) {
		throw new Error("Docker image not found");
	}

	return quoteShellArgs(["docker", "pull", dockerImage]);
};
