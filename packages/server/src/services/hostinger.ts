import createClient from "openapi-fetch";
import type { paths } from "../types/hostinger-types";

const HOSTINGER_API_URL = "https://developers.hostinger.com";
const hostingerApiKey = process.env.HOSTINGER_API_KEY;

const client = createClient<paths>({ baseUrl: HOSTINGER_API_URL });

export const fetchHostingerCatalog = async () => {
	const { data, error } = await client.GET("/api/billing/v1/catalog", {
		headers: {
			Authorization: `Bearer ${hostingerApiKey}`,
		},
	});

	if (error) {
		throw new Error(`Failed to fetch Hostinger catalog: ${error}`);
	}

	return data;
};

export const fetchHostingerDataCenters = async () => {
	const { data, error } = await client.GET("/api/vps/v1/data-centers", {
		headers: {
			Authorization: `Bearer ${hostingerApiKey}`,
		},
	});

	if (error) {
		throw new Error(`Failed to fetch Hostinger data centers: ${error}`);
	}

	return data;
};
