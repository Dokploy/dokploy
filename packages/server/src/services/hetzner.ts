import createClient from "openapi-fetch";
import type { paths } from "../types/hetzner-types";

const HETZNER_API_URL = "https://api.hetzner.cloud/v1";

const hetznerApiKey = process.env.HETZNER_API_KEY;

const client = createClient<paths>({ baseUrl: HETZNER_API_URL });

export const fetchHetznerLocations = async () => {
	const { data, error } = await client.GET("/locations", {
		headers: {
			Authorization: `Bearer ${hetznerApiKey}`,
		},
	});

	if (error) {
		throw new Error(`Failed to fetch Hetzner locations: ${error}`);
	}
	return data;
};

export const fetchHetznerServerTypes = async () => {
	const { data, error } = await client.GET("/server_types", {
		headers: {
			Authorization: `Bearer ${hetznerApiKey}`,
		},
	});

	if (error) {
		throw new Error(`Failed to fetch Hetzner server types: ${error}`);
	}

	return data;
};

export const fetchHetznerServers = async () => {
	const { data, error } = await client.GET("/servers", {
		headers: {
			Authorization: `Bearer ${hetznerApiKey}`,
		},
	});

	if (error) {
		throw new Error(`Failed to fetch Hetzner servers: ${error}`);
	}

	return data;
};
