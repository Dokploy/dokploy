/**
 * Hetzner Cloud API types
 * Based on https://docs.hetzner.cloud
 */

export interface HetznerLocation {
	id: number;
	name: string;
	description: string;
	country: string;
	city: string;
	latitude: number;
	longitude: number;
	network_zone: string;
}

export interface HetznerServerType {
	id: number;
	name: string;
	description: string;
	cores: number;
	memory: number; // in GB
	disk: number; // in GB
	deprecated: boolean;
	prices: Array<{
		location: string;
		price_hourly: {
			net: string;
			gross: string;
		};
		price_monthly: {
			net: string;
			gross: string;
		};
		included_traffic: number;
		price_per_tb_traffic: {
			net: string;
			gross: string;
		};
	}>;
	storage_type: string;
	cpu_type: string;
	category: string;
	architecture: string;
}

export interface HetznerImage {
	id: number;
	type: string;
	status: string;
	name: string | null;
	description: string;
	image_size: number | null;
	disk_size: number;
	created: string;
	created_from: {
		id: number;
		name: string;
	} | null;
	bound_to: number | null;
	os_flavor: string;
	os_version: string | null;
	rapid_deploy: boolean;
	protection: {
		delete: boolean;
	};
	deprecated: string | null;
	deleted: string | null;
	labels: Record<string, string>;
	architecture: string;
}

export interface HetznerSSHKey {
	id: number;
	name: string;
	fingerprint: string;
	public_key: string;
	labels: Record<string, string>;
	created: string;
}

export interface HetznerServer {
	id: number;
	name: string;
	status: string;
	public_net: {
		ipv4: {
			ip: string;
			blocked: boolean;
			dns_ptr: string;
		};
		ipv6: {
			ip: string;
			blocked: boolean;
			dns_ptr: Array<{
				ip: string;
				dns_ptr: string;
			}>;
		};
		floating_ips: number[];
		firewalls: Array<{
			id: number;
			status: string;
		}>;
	};
	server_type: {
		id: number;
		name: string;
		description: string;
		cores: number;
		memory: number;
		disk: number;
		deprecated: boolean;
	};
	datacenter: {
		id: number;
		name: string;
		description: string;
		location: HetznerLocation;
	};
	image: HetznerImage | null;
	created: string;
	labels: Record<string, string>;
	locked: boolean;
	backup_window: string | null;
	outgoing_traffic: number | null;
	ingoing_traffic: number | null;
	included_traffic: number;
	protection: {
		delete: boolean;
		rebuild: boolean;
	};
}

export interface HetznerAction {
	id: number;
	command: string;
	status: "running" | "success" | "error";
	progress: number;
	started: string;
	finished: string | null;
	error: {
		code: string;
		message: string;
	} | null;
	resources: Array<{
		id: number;
		type: string;
	}>;
}

// API Response types
export interface HetznerResponse<T> {
	data?: T;
	error?: {
		code: string;
		message: string;
		details?: unknown;
	};
}

export interface HetznerLocationsResponse {
	locations: HetznerLocation[];
	meta: {
		pagination: {
			page: number;
			per_page: number;
			total_entries: number;
		};
	};
}

export interface HetznerServerTypesResponse {
	server_types: HetznerServerType[];
	meta: {
		pagination: {
			page: number;
			per_page: number;
			total_entries: number;
		};
	};
}

export interface HetznerImagesResponse {
	images: HetznerImage[];
	meta: {
		pagination: {
			page: number;
			per_page: number;
			total_entries: number;
		};
	};
}

export interface HetznerSSHKeyResponse {
	ssh_key: HetznerSSHKey;
}

export interface HetznerSSHKeysResponse {
	ssh_keys: HetznerSSHKey[];
	meta: {
		pagination: {
			page: number;
			per_page: number;
			total_entries: number;
		};
	};
}

export interface HetznerServerResponse {
	server: HetznerServer;
	action?: HetznerAction;
	next_actions?: HetznerAction[];
	root_password?: string;
}

export interface HetznerCreateServerRequest {
	name: string;
	server_type: string;
	location?: string;
	datacenter?: string;
	start_after_create?: boolean;
	image: string;
	ssh_keys?: number[];
	user_data?: string;
	labels?: Record<string, string>;
	automount?: boolean;
	public_net?: {
		enable_ipv4?: boolean;
		enable_ipv6?: boolean;
		ipv4?: number | null;
		ipv6?: number | null;
	};
}

export interface HetznerCreateSSHKeyRequest {
	name: string;
	public_key: string;
	labels?: Record<string, string>;
}
