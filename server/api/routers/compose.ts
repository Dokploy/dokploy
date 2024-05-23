import {
	apiCreateCompose,
	apiFindCompose,
	apiUpdateCompose,
} from "@/server/db/schema";
import {
	createCompose,
	findComposeById,
	loadServices,
	updateCompose,
} from "../services/compose";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { checkServiceAccess } from "../services/user";

export const composeRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateCompose)
		.mutation(async ({ input }) => {
			return createCompose(input);
		}),

	one: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.composeId, "access");
			}

			return await findComposeById(input.composeId);
		}),

	update: protectedProcedure
		.input(apiUpdateCompose)
		.mutation(async ({ input }) => {
			return updateCompose(input.composeId, input);
		}),

	allServices: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input }) => {
			return await loadServices(input.composeId);
		}),
});

// Sí, efectivamente, existen principalmente dos formas de definir montajes (volúmenes) desde el host hacia un contenedor en Docker Compose:

// 1. Montaje Simplificado
// Esta es la forma más sencilla y directa de montar un archivo o directorio desde el host en un contenedor. Utiliza una sintaxis simplificada que Docker interpreta como un volumen de tipo bind.

// Ejemplo
// yaml
// Copiar código
// services:
//   myservice:
//     image: myimage
//     volumes:
//       - ./host/path:/container/path
// 2. Montaje Explicito con type: bind
// Esta forma es más explícita y permite agregar opciones adicionales como read_only y propagation. Utiliza el campo type: bind para especificar que se trata de un volumen de tipo bind.

// Ejemplo Básico
// yaml
// Copiar código
// services:
//   myservice:
//     image: myimage
//     volumes:
//       - type: bind
//         source: ./host/path
//         target: /container/path
// .ssh
