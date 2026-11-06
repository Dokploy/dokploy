export interface FakeOptions {
	traefik?: "running" | "stopped" | null;
	marker?: boolean;
	notModified?: boolean;
	startError?: Error;
	inspectError?: Error;
	crashingStarts?: number;
	markerGone?: boolean;
	markerTaken?: boolean;
	markerOwner?: string;
	markerCreated?: string;
	backup?: boolean;
	serviceMode?: boolean;
}

export const statusError = (message: string, statusCode: number) =>
	Object.assign(new Error(message), { statusCode });

export const fakeDocker = ({
	traefik = "running",
	marker = false,
	notModified = false,
	startError,
	inspectError,
	crashingStarts = 0,
	markerGone = false,
	markerTaken = false,
	markerOwner = "an earlier Dokploy process",
	markerCreated = new Date(0).toISOString(),
	backup = false,
	serviceMode = false,
}: FakeOptions = {}) => {
	const log: string[] = [];
	const containers: { id: string; name: string; running: boolean }[] = [];
	if (traefik) {
		containers.push({
			id: "traefik",
			name: "dokploy-traefik",
			running: traefik === "running",
		});
	}
	const labels = new Map<string, Record<string, string>>();
	const created = new Map<string, string>();
	if (marker) {
		containers.push({
			id: "marker",
			name: "dokploy-traefik-restarting",
			running: false,
		});
		labels.set("marker", { "dokploy.restart.owner": markerOwner });
		created.set("marker", markerCreated);
	}
	if (backup) {
		containers.push({
			id: "backup",
			name: "dokploy-traefik-previous",
			running: false,
		});
	}
	let createdWith: unknown;
	let starts = 0;

	const find = (ref: string) => {
		const found = containers.find((c) => c.id === ref || c.name === ref);
		if (!found) throw statusError(`No such container: ${ref}`, 404);
		return found;
	};

	const container = (ref: string) => ({
		inspect: async () => {
			if (inspectError && ref === "dokploy-traefik") throw inspectError;
			const c = find(ref);
			return {
				Id: c.id,
				Image: `sha256:${c.id}-image`,
				Created: created.get(c.id) ?? new Date(0).toISOString(),
				Config: { Labels: labels.get(c.id) ?? {} },
				State: { Running: c.running, StartedAt: `start-${starts}` },
			};
		},
		rename: async ({ name }: { name: string }) => {
			const c = find(ref);
			log.push(`rename ${c.id} -> ${name}`);
			c.name = name;
		},
		stop: async () => {
			const c = find(ref);
			log.push(`stop ${c.id}`);
			c.running = false;
			if (notModified) throw statusError("container already stopped", 304);
		},
		start: async () => {
			const c = find(ref);
			log.push(`start ${c.id}`);
			if (startError) throw startError;
			starts += 1;
			c.running = starts > crashingStarts;
			if (notModified) throw statusError("container already started", 304);
		},
		remove: async () => {
			const c = find(ref);
			log.push(`remove ${c.id}`);
			containers.splice(containers.indexOf(c), 1);
			if (markerGone && c.id === "marker") {
				throw statusError("No such container: marker", 404);
			}
		},
		logs: async () => Buffer.alloc(0),
	});

	const docker = {
		getContainer: (ref: string) => container(ref),
		getService: () => ({
			inspect: async () => {
				if (!serviceMode) throw statusError("service not found", 404);
				return {};
			},
		}),
		createContainer: async (settings: {
			name: string;
			Image: string;
			Labels?: Record<string, string>;
		}) => {
			if (markerTaken) {
				throw statusError(`Conflict: ${settings.name} is already in use`, 409);
			}
			createdWith = settings;
			containers.push({ id: "marker", name: settings.name, running: false });
			labels.set("marker", settings.Labels ?? {});
			created.set("marker", new Date().toISOString());
			log.push(`create ${settings.name}`);
			return container("marker");
		},
	};

	return { docker, log, containers, createdWith: () => createdWith };
};
