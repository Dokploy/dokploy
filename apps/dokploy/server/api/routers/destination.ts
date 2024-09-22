import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
} from "@/server/db/schema";
import { execAsync } from "@/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { findAdmin } from "../services/admin";
import {
	createDestintation,
	findDestinationById,
	removeDestinationById,
	updateDestinationById,
} from "../services/destination";

export const destinationRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			try {
				await createDestintation(input);
				return await findAdmin();
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the destination",
					cause: error,
				});
			}
		}),
	testConnection: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			console.log(input);
			// const { secretAccessKey, bucket, region, endpoint, accessKey } = input;
			// try {
			// 	const rcloneFlags = [
			// 		// `--s3-provider=Cloudflare`,
			// 		`--s3-access-key-id=${accessKey}`,
			// 		`--s3-secret-access-key=${secretAccessKey}`,
			// 		`--s3-region=${region}`,
			// 		`--s3-endpoint=${endpoint}`,
			// 		"--s3-no-check-bucket",
			// 		"--s3-force-path-style",
			// 	];
			const connextion = buildRcloneCommand(input.json.provider, input.json);
			console.log(connextion);
			// const rcloneDestination = `:s3:${bucket}`;
			// const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
			await execAsync(connextion);
			// } catch (error) {
			// 	console.log(error);
			// 	throw new TRPCError({
			// 		code: "BAD_REQUEST",
			// 		message: "Error to connect to bucket",
			// 		cause: error,
			// 	});
			// }
		}),
	one: protectedProcedure
		.input(apiFindOneDestination)
		.query(async ({ input }) => {
			const destination = await findDestinationById(input.destinationId);
			return destination;
		}),
	all: adminProcedure.query(async () => {
		return await db.query.destinations.findMany({});
	}),
	remove: adminProcedure
		.input(apiRemoveDestination)
		.mutation(async ({ input }) => {
			try {
				return await removeDestinationById(input.destinationId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this destination",
				});
			}
		}),
	update: adminProcedure
		.input(apiUpdateDestination)
		.mutation(async ({ input }) => {
			try {
				return await updateDestinationById(input.destinationId, input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update this destination",
					cause: error,
				});
			}
		}),
});
function buildRcloneCommand(
	providerType: string,
	credentials: Record<string, string>,
): string {
	let rcloneFlags: string[] = [];
	let rcloneDestination = "";
	let rcloneCommand = "";

	switch (providerType) {
		case "s3":
			{
				const {
					accessKey,
					secretAccessKey,
					region,
					endpoint,
					bucket,
					provider,
					storageClass,
					acl,
				} = credentials;

				if (!accessKey || !secretAccessKey || !region || !endpoint || !bucket) {
					throw new Error("Missing required S3 credentials.");
				}

				rcloneFlags.push(`--s3-access-key-id=${accessKey}`);
				rcloneFlags.push(`--s3-secret-access-key=${secretAccessKey}`);
				rcloneFlags.push(`--s3-region=${region}`);
				rcloneFlags.push(`--s3-endpoint=${endpoint}`);
				rcloneFlags.push("--s3-no-check-bucket");
				rcloneFlags.push("--s3-force-path-style");

				if (provider && provider !== "AWS") {
					rcloneFlags.push(`--s3-provider=${provider}`);
				}
				if (storageClass) {
					rcloneFlags.push(`--s3-storage-class=${storageClass}`);
				}
				if (acl) {
					rcloneFlags.push(`--s3-acl=${acl}`);
				}

				rcloneDestination = `:s3:${bucket}`;
			}
			break;

		case "azureblob":
			{
				const { account, key, endpoint, container } = credentials;

				if (!account || !key || !container) {
					throw new Error("Missing required Azure Blob Storage credentials.");
				}

				rcloneFlags.push(`--azureblob-account=${account}`);
				rcloneFlags.push(`--azureblob-key=${key}`);
				if (endpoint) {
					rcloneFlags.push(`--azureblob-endpoint=${endpoint}`);
				}

				rcloneDestination = `:azureblob:${container}`;
			}
			break;

		case "ftp":
			{
				const { host, port, user, pass, secure, path } = credentials;

				if (!host || !user || !pass) {
					throw new Error("Missing required FTP credentials.");
				}

				rcloneFlags.push(`--ftp-host=${host}`);
				rcloneFlags.push(`--ftp-user=${user}`);
				rcloneFlags.push(`--ftp-pass=${pass}`);
				if (port) {
					rcloneFlags.push(`--ftp-port=${port}`);
				}
				if (secure === "true" || secure === "1") {
					rcloneFlags.push("--ftp-tls");
				}

				rcloneDestination = `:ftp:${path || "/"}`;
			}
			break;

		case "gcs":
			{
				const {
					serviceAccountFile,
					clientId,
					clientSecret,
					projectNumber,
					bucket,
					objectAcl,
					bucketAcl,
				} = credentials;

				if (serviceAccountFile) {
					rcloneFlags.push(`--gcs-service-account-file=${serviceAccountFile}`);
				} else if (clientId && clientSecret && projectNumber) {
					rcloneFlags.push(`--gcs-client-id=${clientId}`);
					rcloneFlags.push(`--gcs-client-secret=${clientSecret}`);
					rcloneFlags.push(`--gcs-project-number=${projectNumber}`);
				} else {
					throw new Error(
						"Missing required GCS credentials. Provide either serviceAccountFile or clientId, clientSecret, and projectNumber.",
					);
				}

				if (!bucket) {
					throw new Error("Bucket name is required for GCS.");
				}

				if (objectAcl) {
					rcloneFlags.push(`--gcs-object-acl=${objectAcl}`);
				}
				if (bucketAcl) {
					rcloneFlags.push(`--gcs-bucket-acl=${bucketAcl}`);
				}

				rcloneDestination = `:gcs:${bucket}`;
			}
			break;

		case "dropbox":
			{
				const { token, path } = credentials;

				if (!token) {
					throw new Error("Access token is required for Dropbox.");
				}

				// Warning: Passing tokens via command line can be insecure.
				rcloneFlags.push(`--dropbox-token='{"access_token":"${token}"}'`);
				rcloneDestination = `:dropbox:${path || "/"}`;
			}
			break;

		default:
			throw new Error(`Unsupported provider type: ${providerType}`);
	}

	// Assemble the Rclone command
	rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
	return rcloneCommand;
}
