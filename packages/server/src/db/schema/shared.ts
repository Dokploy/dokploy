import { pgEnum } from "drizzle-orm/pg-core";

export const applicationStatus = pgEnum("applicationStatus", [
	"idle",
	"running",
	"done",
	"error",
]);

export const certificateType = pgEnum("certificateType", [
	"letsencrypt",
	"none",
]);
