import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "./logger";
import { db } from "./db";
import { sql } from "drizzle-orm";
import "dotenv/config";
import { licenseRouter } from "./api/license";
import { stripeRouter } from "./api/stripe";

const app = new Hono();
const router = new Hono();
router.use(
	"/*",
	cors({
		origin: ["http://localhost:3001"],
	}),
);

router.get("/health", async (c) => {
	try {
		await db.execute(sql`SELECT 1`);
		return c.json({ status: "ok" });
	} catch (error) {
		logger.error("Database connection error:", error);
		return c.json({ status: "error" }, 500);
	}
});

app.route("/api", router);
app.route("/api/license", licenseRouter);
app.route("/api/stripe", stripeRouter);
const port = process.env.PORT || 4002;
console.log(`Server is running on port http://localhost:${port}`);

serve({
	fetch: app.fetch,
	port: Number(port),
});
