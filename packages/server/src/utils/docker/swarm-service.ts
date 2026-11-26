import type Dockerode from "dockerode";

export const SERVICE_UPDATE_ATTEMPTS = 3;

type DockerApiError = {
	statusCode?: number;
	message?: string;
	json?: { message?: string } | null;
};

export type ServiceInspectInfo = Awaited<
	ReturnType<Dockerode.Service["inspect"]>
>;

export const isDockerNotFoundError = (error: unknown) =>
	(error as DockerApiError | null)?.statusCode === 404;

// Swarm reports a stale spec version as HTTP 500 "update out of sequence", not 409.
export const isUpdateOutOfSequenceError = (error: unknown) => {
	const apiError = error as DockerApiError | null;
	const text = `${apiError?.message ?? ""} ${apiError?.json?.message ?? ""}`;
	return /update out of sequence/i.test(text);
};

export const createOrUpdateSwarmService = async ({
	docker,
	serviceName,
	create,
	update,
}: {
	docker: Dockerode;
	serviceName: string;
	create: () => Promise<unknown>;
	update: (
		service: Dockerode.Service,
		inspect: ServiceInspectInfo,
	) => Promise<unknown>;
}) => {
	const service = docker.getService(serviceName);
	for (let attempt = 1; ; attempt++) {
		let inspect: ServiceInspectInfo;
		try {
			inspect = await service.inspect();
		} catch (error) {
			if (!isDockerNotFoundError(error)) throw error;
			await create();
			return;
		}

		try {
			await update(service, inspect);
			return;
		} catch (error) {
			if (
				attempt >= SERVICE_UPDATE_ATTEMPTS ||
				!isUpdateOutOfSequenceError(error)
			) {
				throw error;
			}
		}
	}
};
