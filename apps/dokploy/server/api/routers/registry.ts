import {
	apiCreateRegistry,
	apiEnableSelfHostedRegistry,
	apiFindOneRegistry,
	apiRemoveRegistry,
	apiTestRegistry,
	apiUpdateRegistry,
} from "@/server/db/schema";
import { initializeRegistry } from "@/server/setup/registry-setup";
import { execAsync, execAsyncRemote } from "@/server/utils/process/execAsync";
import { manageRegistry } from "@/server/utils/traefik/registry";
import { TRPCError } from "@trpc/server";
import {
	createRegistry,
	findAllRegistry,
	findRegistryById,
	removeRegistry,
	updateRegistry,
} from "../services/registry";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

export const registryRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateRegistry)
		.mutation(async ({ ctx, input }) => {
			return await createRegistry(input);
		}),
	remove: adminProcedure
		.input(apiRemoveRegistry)
		.mutation(async ({ ctx, input }) => {
			return await removeRegistry(input.registryId);
		}),
	update: protectedProcedure
		.input(apiUpdateRegistry)
		.mutation(async ({ input }) => {
			const { registryId, ...rest } = input;
			const application = await updateRegistry(registryId, {
				...rest,
			});

			if (!application) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to update registry",
				});
			}

			return true;
		}),
	all: protectedProcedure.query(async () => {
		return await findAllRegistry();
	}),
	one: adminProcedure.input(apiFindOneRegistry).query(async ({ input }) => {
		return await findRegistryById(input.registryId);
	}),
	testRegistry: protectedProcedure
		.input(apiTestRegistry)
		.mutation(async ({ input }) => {
			try {
				const loginCommand = `echo ${input.password} | docker login ${input.registryUrl} --username ${input.username} --password-stdin`;

				if (input.serverId && input.serverId !== "none") {
					await execAsyncRemote(input.serverId, loginCommand);
				} else {
					await execAsync(loginCommand);
				}

				return true;
			} catch (error) {
				console.log("Error Registry:", error);
				return false;
			}
		}),

	enableSelfHostedRegistry: adminProcedure
		.input(apiEnableSelfHostedRegistry)
		.mutation(async ({ input }) => {
			const selfHostedRegistry = await createRegistry({
				...input,
				registryName: "Self Hosted Registry",
				registryType: "selfHosted",
				registryUrl:
					process.env.NODE_ENV === "production"
						? input.registryUrl
						: "dokploy-registry.docker.localhost",
				imagePrefix: null,
				serverId: undefined,
			});

			await manageRegistry(selfHostedRegistry);
			await initializeRegistry(input.username, input.password);

			return selfHostedRegistry;
		}),
});

const shellEscape = (str: string) => {
	const ret = [];
	let s = str;
	if (/[^A-Za-z0-9_\/:=-]/.test(s)) {
		s = `'${s.replace(/'/g, "'\\''")}'`;
		s = s
			.replace(/^(?:'')+/g, "") // unduplicate single-quote at the beginning
			.replace(/\\'''/g, "\\'"); // remove non-escaped single-quote if there are enclosed between 2 escaped
	}
	ret.push(s);

	return ret.join(" ");
};
