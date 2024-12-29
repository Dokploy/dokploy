import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "hono/bearer-auth";
import { logServerMetrics } from "./socket.js";
import { config } from "dotenv";
import { metricsHandler } from "./handlers.js";
import { serverLogFile } from "./constants.js";
config();

const TOKEN = process.env.TOKEN || "default-token";
const app = new Hono();

const origin =
	process.env.NODE_ENV === "production"
		? "https://dokploy.com"
		: "http://localhost:3000";
// Configurar CORS
app.use(
	"*",
	cors({
		origin: "*",
		credentials: true,
	}),
);

app.use("/*", cors());
// app.use(
// 	"/*",
// 	bearerAuth({
// 		token: TOKEN,
// 	}),
// );
app.use(async (c, next) => {
	if (c.req.path === "/health") {
		return next();
	}
	// const authHeader = c.req.header("x-token");

	// if (TOKEN !== authHeader) {
	// 	return c.json({ message: "Invalid API Key" }, 403);
	// }

	return next();
});

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.get("/metrics", metricsHandler);

app.get("/health", (c) => {
	return c.text("OK");
});

const port = 3001;
console.log(`Server is running on http://localhost:${port}`);

serve({
	fetch: app.fetch,
	port,
});

logServerMetrics();
