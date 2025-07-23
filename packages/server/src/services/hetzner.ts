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

export const fetchHetznerLocations = async (
	apiKey: string,
): Promise<HetznerLocation[]> => {
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
};

export const fetchHetznerServerTypes = async (
	apiKey: string,
): Promise<HetznerServerType[]> => {
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
};

export const fetchHetznerServers = async (
	apiKey: string,
): Promise<HetznerServer[]> => {
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
};
