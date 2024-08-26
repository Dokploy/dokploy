import { z } from "zod";
import { findAdmin, updateAdmin } from "../services/admin";
import { adminProcedure, createTRPCRouter } from "../trpc";
import { TRPCError } from "@trpc/server";

export const licenseRouter = createTRPCRouter({
	setLicense: adminProcedure.input(z.string()).mutation(async ({ input }) => {
		const admin = await findAdmin();

		try {
			const result = await fetch("http://127.0.0.1:4000/v1/validate-license", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					licenseKey: input,
				}),
			});

			const data = await result.json();

			if (!data.valid) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "License is invalid",
				});
			}

			if (data.valid) {
				return await updateAdmin(admin.authId, {
					licenseKey: input,
				});
			}
		} catch (err) {
			return await updateAdmin(admin.authId, {
				licenseKey: "",
			});
		}
	}),
});
