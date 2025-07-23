const HOSTINGER_API_URL = "https://developers.hostinger.com";

interface HostingerCatalogItem {
	id: string;
	name: string;
	category: string;
	prices: Array<{
		id: string;
		name: string;
		currency: string;
		price: number; // en centavos
		first_period_price: number; // precio promocional en centavos
		period: number;
		period_unit: string;
	}>;
	metadata: {
		cpus: string;
		memory: string;
		bandwidth: string;
		disk_space: string;
		network: string;
	};
}

interface HostingerServer {
	id: string;
	name: string;
	status: string;
	created_at: string;
	ip_address: string;
	plan: {
		name: string;
		cpu: number;
		ram: number;
		storage: number;
	};
	location: string;
}

interface HostingerDataCenter {
	id: number;
	name: string;
	location: string;
	country: string;
}

// Obtener catalog items (productos VPS con precios reales)
export async function fetchHostingerCatalog(
	apiKey: string,
): Promise<HostingerCatalogItem[]> {
	const response = await fetch(
		`${HOSTINGER_API_URL}/api/billing/v1/catalog?category=VPS`,
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		},
	);

	console.log(response);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch Hostinger catalog: ${response.statusText}`,
		);
	}

	const data = (await response.json()) as HostingerCatalogItem[];
	console.log(data);
	return data || [];
}

// Obtener VPS existentes
export async function fetchHostingerServers(
	apiKey: string,
): Promise<HostingerServer[]> {
	const response = await fetch(
		`${HOSTINGER_API_URL}/api/vps/v1/virtual-machines`,
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		},
	);

	if (!response.ok) {
		// Si no hay servidores o falla, retornamos array vacío
		return [];
	}

	const data = (await response.json()) as { data?: HostingerServer[] };
	return data.data || [];
}

// Obtener data centers disponibles
export async function fetchHostingerDataCenters(
	apiKey: string,
): Promise<HostingerDataCenter[]> {
	const response = await fetch(`${HOSTINGER_API_URL}/api/vps/v1/data-centers`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch Hostinger data centers: ${response.statusText}`,
		);
	}

	const data = (await response.json()) as { data?: HostingerDataCenter[] };
	return data.data || [];
}
