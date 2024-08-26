import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "dotenv";
import { validateLemonSqueezyLicense } from "./utils";
import { cors } from "hono/cors";

config();

const app = new Hono();

app.use(
	"/*",
	cors({
		origin: ["http://localhost:3000", "http://localhost:3001"], // Ajusta esto a los orígenes de tu aplicación Next.js
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
		maxAge: 600,
		credentials: true,
	}),
);

export const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
export const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;

app.get("/v1/health", (c) => {
	return c.text("Hello Hono!");
});

app.post("/v1/validate-license", async (c) => {
	const { licenseKey } = await c.req.json();

	if (!licenseKey) {
		return c.json({ error: "License key is required" }, 400);
	}

	try {
		const licenseValidation = await validateLemonSqueezyLicense(licenseKey);

		if (licenseValidation.valid) {
			return c.json({
				valid: true,
				message: "License is valid",
				metadata: licenseValidation.meta,
			});
		}
		return c.json(
			{
				valid: false,
				message: licenseValidation.error || "Invalid license",
			},
			400,
		);
	} catch (error) {
		console.error("Error during license validation:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

const port = 4000;
console.log(`Server is running on port ${port}`);

serve({
	fetch: app.fetch,
	port,
});
