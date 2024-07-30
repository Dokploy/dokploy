export const baseUrl =
	process.env.NODE_ENV === "development"
		? "http://localhost:3000"
		: "https://docs.dokploy.com";

export const url = (path: string): string => new URL(path, baseUrl).toString();
