import type {
	HetznerCreateServerRequest,
	HetznerImage,
	HetznerImagesResponse,
	HetznerLocation,
	HetznerLocationsResponse,
	HetznerServerResponse,
	HetznerServerType,
	HetznerServerTypesResponse,
	HetznerSSHKey,
	HetznerSSHKeyResponse,
	HetznerSSHKeysResponse,
} from "./types";

/**
 * Hetzner Cloud API client
 */
export class HetznerClient {
	private apiToken: string;
	private baseURL = "https://api.hetzner.cloud/v1";

	constructor(apiToken: string) {
		this.apiToken = apiToken;
	}

	private async request<T>(
		path: string,
		options: RequestInit = {},
	): Promise<T> {
		const response = await fetch(`${this.baseURL}${path}`, {
			...options,
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				"Content-Type": "application/json",
				...options.headers,
			},
			signal: AbortSignal.timeout(30000),
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(
				`Hetzner API error: ${response.status} - ${JSON.stringify(error)}`,
			);
		}

		return response.json();
	}

	/**
	 * Validate API token by making a test request
	 */
	async validateToken(): Promise<boolean> {
		try {
			await this.request("/locations");
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get available locations
	 */
	async getLocations(params?: {
		page?: number;
		per_page?: number;
	}): Promise<HetznerLocationsResponse> {
		const query = new URLSearchParams();
		if (params?.page) query.set("page", String(params.page));
		if (params?.per_page) query.set("per_page", String(params.per_page));
		return this.request<HetznerLocationsResponse>(
			`/locations${query.toString() ? `?${query.toString()}` : ""}`,
		);
	}

	/**
	 * Get available server types
	 */
	async getServerTypes(params?: {
		page?: number;
		per_page?: number;
	}): Promise<HetznerServerTypesResponse> {
		const query = new URLSearchParams();
		if (params?.page) query.set("page", String(params.page));
		if (params?.per_page) query.set("per_page", String(params.per_page));
		return this.request<HetznerServerTypesResponse>(
			`/server_types${query.toString() ? `?${query.toString()}` : ""}`,
		);
	}

	/**
	 * Get available images
	 */
	async getImages(query?: {
		type?: "system" | "app" | "snapshot" | "backup";
		architecture?: "x86" | "arm";
		page?: number;
		per_page?: number;
	}): Promise<HetznerImagesResponse> {
		const params = new URLSearchParams();
		if (query) {
			Object.entries(query).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					params.append(key, value.toString());
				}
			});
		}
		const path = `/images${params.toString() ? `?${params.toString()}` : ""}`;
		return this.request<HetznerImagesResponse>(path);
	}

	/**
	 * Get SSH keys
	 */
	async getSSHKeys(params?: {
		page?: number;
		per_page?: number;
	}): Promise<HetznerSSHKeysResponse> {
		const query = new URLSearchParams();
		if (params?.page) query.set("page", String(params.page));
		if (params?.per_page) query.set("per_page", String(params.per_page));
		return this.request<HetznerSSHKeysResponse>(
			`/ssh_keys${query.toString() ? `?${query.toString()}` : ""}`,
		);
	}

	/**
	 * Create an SSH key
	 */
	async createSSHKey(
		name: string,
		publicKey: string,
	): Promise<HetznerSSHKeyResponse> {
		const payload = {
			name,
			public_key: publicKey,
		};
		return this.request<HetznerSSHKeyResponse>("/ssh_keys", {
			method: "POST",
			body: JSON.stringify(payload),
		});
	}

	/**
	 * List SSH keys
	 */
	async listSSHKeys(): Promise<HetznerSSHKeysResponse> {
		return this.request<HetznerSSHKeysResponse>("/ssh_keys");
	}

	/**
	 * Delete an SSH key
	 */
	async deleteSSHKey(keyId: number): Promise<void> {
		await this.request(`/ssh_keys/${keyId}`, {
			method: "DELETE",
		});
	}

	/**
	 * Create a new server
	 */
	async createServer(
		config: HetznerCreateServerRequest,
	): Promise<HetznerServerResponse> {
		return this.request<HetznerServerResponse>("/servers", {
			method: "POST",
			body: JSON.stringify(config),
		});
	}

	/**
	 * Get server by ID
	 */
	async getServer(serverId: number): Promise<HetznerServerResponse> {
		return this.request<HetznerServerResponse>(`/servers/${serverId}`);
	}

	/**
	 * Delete a server
	 */
	async deleteServer(serverId: number): Promise<void> {
		await this.request(`/servers/${serverId}`, {
			method: "DELETE",
		});
	}
}
