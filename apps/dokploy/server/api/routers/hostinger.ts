import { createTRPCRouter, protectedProcedure } from "../trpc";
import { z } from "zod";

const HOSTINGER_API_URL = "https://api.hostinger.com";

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

interface HostingerTemplate {
	id: number;
	name: string;
	description: string;
	documentation?: string;
}

interface HostingerDataCenter {
	id: number;
	name: string;
	location: string;
	country: string;
}

interface HostingerVMCreateResponse {
	order: {
		id: number;
		subscription_id: string;
		status: string;
		currency: string;
		subtotal: number;
		total: number;
	};
	virtual_machine: {
		id: number;
		subscription_id: string;
		plan: string;
		hostname: string;
		state: string;
		cpus: number;
		memory: number;
		disk: number;
		bandwidth: number;
		ipv4: Array<{
			id: number;
			address: string;
			ptr: string;
		}>;
	};
}

// Obtener catalog items (productos VPS con precios reales)
async function fetchHostingerCatalog(
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

	if (!response.ok) {
		throw new Error(
			`Failed to fetch Hostinger catalog: ${response.statusText}`,
		);
	}

	const data = (await response.json()) as HostingerCatalogItem[];
	return data || [];
}

// Obtener VPS existentes
async function fetchHostingerServers(
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

// Obtener templates (sistemas operativos) disponibles
async function fetchHostingerTemplates(
	apiKey: string,
): Promise<HostingerTemplate[]> {
	const response = await fetch(`${HOSTINGER_API_URL}/api/vps/v1/templates`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch Hostinger templates: ${response.statusText}`,
		);
	}

	const data = (await response.json()) as { data?: HostingerTemplate[] };
	return data.data || [];
}

// Obtener data centers disponibles
async function fetchHostingerDataCenters(
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

// Crear nuevo VPS
async function createHostingerVPS(
	apiKey: string,
	params: {
		item_id: string;
		template_id: number;
		data_center_id: number;
		hostname?: string;
		password?: string;
		enable_backups?: boolean;
		public_key?: {
			name: string;
			key: string;
		};
	},
): Promise<HostingerVMCreateResponse> {
	const response = await fetch(
		`${HOSTINGER_API_URL}/api/vps/v1/virtual-machines`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				item_id: params.item_id,
				setup: {
					template_id: params.template_id,
					data_center_id: params.data_center_id,
					hostname: params.hostname || `vps-${Date.now()}.hstgr.cloud`,
					password: params.password || generateRandomPassword(),
					enable_backups: params.enable_backups ?? true,
					install_monarx: false,
					...(params.public_key && { public_key: params.public_key }),
				},
				coupons: [],
			}),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`Failed to create Hostinger VPS: ${response.statusText} - ${error}`,
		);
	}

	return (await response.json()) as HostingerVMCreateResponse;
}

// Generar contraseña aleatoria
function generateRandomPassword(): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
	let password = "";
	for (let i = 0; i < 16; i++) {
		password += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return password;
}

export const hostingerRouter = createTRPCRouter({
	vpsPlans: protectedProcedure.query(async () => {
		const apiKey = process.env.HOSTINGER_API_KEY;
		if (!apiKey) {
			throw new Error("Hostinger API key not configured");
		}

		const catalogItems = await fetchHostingerCatalog(apiKey);
		return catalogItems.filter((item) => item.name.startsWith("KVM"));
	}),

	servers: protectedProcedure.query(async () => {
		const apiKey = process.env.HOSTINGER_API_KEY;
		if (!apiKey) {
			return [];
		}
		return await fetchHostingerServers(apiKey);
	}),

	templates: protectedProcedure.query(async () => {
		const apiKey = process.env.HOSTINGER_API_KEY;
		if (!apiKey) {
			throw new Error("Hostinger API key not configured");
		}
		return await fetchHostingerTemplates(apiKey);
	}),

	dataCenters: protectedProcedure.query(async () => {
		const apiKey = process.env.HOSTINGER_API_KEY;
		if (!apiKey) {
			throw new Error("Hostinger API key not configured");
		}
		return await fetchHostingerDataCenters(apiKey);
	}),

	createVPS: protectedProcedure
		.input(
			z.object({
				item_id: z.string(),
				template_id: z.number(),
				data_center_id: z.number(),
				hostname: z.string().optional(),
				password: z.string().optional(),
				enable_backups: z.boolean().optional(),
				ssh_key_name: z.string().optional(),
				ssh_key_content: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const apiKey = process.env.HOSTINGER_API_KEY;
			if (!apiKey) {
				throw new Error("Hostinger API key not configured");
			}

			const publicKey =
				input.ssh_key_name && input.ssh_key_content
					? {
							name: input.ssh_key_name,
							key: input.ssh_key_content,
						}
					: undefined;

			return await createHostingerVPS(apiKey, {
				item_id: input.item_id,
				template_id: input.template_id,
				data_center_id: input.data_center_id,
				hostname: input.hostname,
				password: input.password,
				enable_backups: input.enable_backups,
				public_key: publicKey,
			});
		}),
});
