import { createTRPCRouter, protectedProcedure } from "../trpc";

const HETZNER_API_URL = "https://api.hetzner.cloud/v1";

interface HetznerLocation {
	id: number;
	name: string;
	description: string;
	country: string;
	city: string;
	latitude: number;
	longitude: number;
	network_zone: string;
}

interface HetznerServerType {
	id: number;
	name: string;
	description: string;
	cores: number;
	memory: number;
	disk: number;
	prices: {
		location: string;
		price_hourly: {
			net: string;
			gross: string;
		};
		price_monthly: {
			net: string;
			gross: string;
		};
	}[];
	storage_type: string;
	cpu_type: string;
	architecture: string;
}

interface HetznerServer {
	id: number;
	name: string;
	status: string;
	created: string;
	server_type: {
		id: number;
		name: string;
		description: string;
		cores: number;
		memory: number;
		disk: number;
	};
	public_net: {
		ipv4: {
			ip: string;
		};
		ipv6: {
			ip: string;
		};
	};
}

async function fetchHetznerLocations(
	apiKey: string,
): Promise<HetznerLocation[]> {
	const response = await fetch(`${HETZNER_API_URL}/locations`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch Hetzner locations: ${response.statusText}`,
		);
	}

	const data = (await response.json()) as { locations?: HetznerLocation[] };
	return data.locations || [];
}

async function fetchHetznerServerTypes(
	apiKey: string,
): Promise<HetznerServerType[]> {
	const response = await fetch(`${HETZNER_API_URL}/server_types`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch Hetzner server types: ${response.statusText}`,
		);
	}

	const data = (await response.json()) as {
		server_types?: HetznerServerType[];
	};
	return data.server_types || [];
}

async function fetchHetznerServers(apiKey: string): Promise<HetznerServer[]> {
	const response = await fetch(`${HETZNER_API_URL}/servers`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Hetzner servers: ${response.statusText}`);
	}

	const data = (await response.json()) as { servers?: HetznerServer[] };
	return data.servers || [];
}

export const hetznerRouter = createTRPCRouter({
	locations: protectedProcedure.query(async () => {
		const apiKey = process.env.HETZNER_API_KEY;
		if (!apiKey) {
			throw new Error("Hetzner API key not configured");
		}
		return await fetchHetznerLocations(apiKey);
	}),

	serverTypes: protectedProcedure.query(async () => {
		const apiKey = process.env.HETZNER_API_KEY;
		if (!apiKey) {
			throw new Error("Hetzner API key not configured");
		}
		return await fetchHetznerServerTypes(apiKey);
	}),

	servers: protectedProcedure.query(async () => {
		const apiKey = process.env.HETZNER_API_KEY;
		if (!apiKey) {
			throw new Error("Hetzner API key not configured");
		}
		return await fetchHetznerServers(apiKey);
	}),
});
