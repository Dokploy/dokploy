import { relations } from "drizzle-orm";
import {
	integer,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { environments } from "./environment";
import { server } from "./server";
import { encryptedText } from "./utils";

export const sandboxStatus = pgEnum("sandboxStatus", [
	"creating",
	"running",
	"killed",
	"error",
]);

export const sandboxNetworkMode = pgEnum("sandboxNetworkMode", [
	"isolated",
	"internet",
]);

export const SANDBOX_TEMPLATE_NAMES = ["base", "python", "node"] as const;
export type SandboxTemplateName = (typeof SANDBOX_TEMPLATE_NAMES)[number];

export const SANDBOX_DEFAULTS = {
	cpu: 1,
	memoryMb: 512,
	pidsLimit: 256,
	timeoutMs: 300_000,
	workdir: "/home/user",
	execTimeoutMs: 60_000,
} as const;

export const sandboxes = pgTable("sandbox", {
	sandboxId: text("sandboxId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	environmentId: text("environmentId")
		.notNull()
		.references(() => environments.environmentId, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
	image: text("image").notNull(),
	template: text("template"),
	containerId: text("containerId"),
	status: sandboxStatus("status").notNull().default("creating"),
	cpu: real("cpu").notNull().default(SANDBOX_DEFAULTS.cpu),
	memoryMb: integer("memoryMb").notNull().default(SANDBOX_DEFAULTS.memoryMb),
	pidsLimit: integer("pidsLimit")
		.notNull()
		.default(SANDBOX_DEFAULTS.pidsLimit),
	timeoutMs: integer("timeoutMs")
		.notNull()
		.default(SANDBOX_DEFAULTS.timeoutMs),
	expiresAt: timestamp("expiresAt", { withTimezone: true }),
	lastActivityAt: timestamp("lastActivityAt", { withTimezone: true }),
	networkMode: sandboxNetworkMode("networkMode").notNull().default("isolated"),
	envVars: encryptedText("envVars"),
	workdir: text("workdir").notNull().default(SANDBOX_DEFAULTS.workdir),
	user: text("user"),
	runtime: text("runtime"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	killedAt: timestamp("killedAt", { withTimezone: true }),
});

export const sandboxRelations = relations(sandboxes, ({ one }) => ({
	environment: one(environments, {
		fields: [sandboxes.environmentId],
		references: [environments.environmentId],
	}),
	server: one(server, {
		fields: [sandboxes.serverId],
		references: [server.serverId],
	}),
}));

const absolutePath = z
	.string()
	.min(1)
	.max(4096)
	.refine(
		(value) => value.startsWith("/") && !value.includes("\0"),
		"Path must be absolute",
	);

export const apiCreateSandbox = z
	.object({
		environmentId: z.string().min(1),
		name: z.string().min(1).max(64).optional(),
		template: z.enum(SANDBOX_TEMPLATE_NAMES).optional(),
		image: z.string().min(1).max(255).optional(),
		serverId: z.string().nullable().optional(),
		cpu: z.number().min(0.1).max(64).optional(),
		memoryMb: z.number().int().min(64).max(262_144).optional(),
		pidsLimit: z.number().int().min(16).max(65_536).optional(),
		timeoutMs: z
			.number()
			.int()
			.min(10_000)
			.max(24 * 60 * 60 * 1000)
			.optional(),
		networkMode: z.enum(["isolated", "internet"]).optional(),
		envVars: z.string().max(65_536).optional(),
		workdir: absolutePath.optional(),
	})
	.refine((value) => !!value.template || !!value.image, {
		message: "Either template or image is required",
		path: ["image"],
	});

export const apiFindOneSandbox = z.object({
	sandboxId: z.string().min(1),
});

export const apiListSandboxes = z
	.object({
		environmentId: z.string().min(1).optional(),
		projectId: z.string().min(1).optional(),
	})
	.refine((value) => !!value.environmentId || !!value.projectId, {
		message: "Either environmentId or projectId is required",
		path: ["environmentId"],
	});

export const apiExecSandbox = z.object({
	sandboxId: z.string().min(1),
	cmd: z.string().min(1).max(65_536),
	cwd: absolutePath.optional(),
	env: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()).optional(),
	timeoutMs: z.number().int().min(1000).max(600_000).optional(),
});

export const apiWriteFileSandbox = z.object({
	sandboxId: z.string().min(1),
	path: absolutePath,
	content: z.string(),
	encoding: z.enum(["utf8", "base64"]).default("utf8"),
	mode: z.number().int().min(0).max(0o7777).optional(),
});

export const apiReadFileSandbox = z.object({
	sandboxId: z.string().min(1),
	path: absolutePath,
	encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

export const apiListFilesSandbox = z.object({
	sandboxId: z.string().min(1),
	path: absolutePath.optional(),
});

export const apiSetTimeoutSandbox = z.object({
	sandboxId: z.string().min(1),
	timeoutMs: z
		.number()
		.int()
		.min(10_000)
		.max(24 * 60 * 60 * 1000),
});
