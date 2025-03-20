export const WEBSITE_URL =
	process.env.NODE_ENV === "development"
		? "http://localhost:3001"
		: process.env.SITE_URL;
