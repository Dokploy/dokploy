import { db } from "@/server/db";
import { member, organization } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";
export const organizationRouter = createTRPCRouter({
	create: adminProcedure
		.input(
			z.object({
				name: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const result = await db
				.insert(organization)
				.values({
					...input,
					slug: nanoid(),
					createdAt: new Date(),
					ownerId: ctx.user.ownerId,
				})
				.returning()
				.then((res) => res[0]);

			if (!result) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create organization",
				});
			}

			const memberResult = await db.insert(member).values({
				organizationId: result.id,
				role: "owner",
				createdAt: new Date(),
				userId: ctx.user.id,
			});
			return result;
		}),
	all: adminProcedure.query(async ({ ctx }) => {
		return await db.query.organization.findMany({
			where: eq(organization.ownerId, ctx.user.ownerId),
			orderBy: [desc(organization.createdAt)],
		});
	}),
	one: adminProcedure
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			return await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});
		}),
	update: adminProcedure
		.input(
			z.object({
				organizationId: z.string(),
				name: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const result = await db
				.update(organization)
				.set({ name: input.name })
				.where(eq(organization.id, input.organizationId))
				.returning();
			return result[0];
		}),
	delete: adminProcedure
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const result = await db
				.delete(organization)
				.where(eq(organization.id, input.organizationId));
			return result;
		}),
});
