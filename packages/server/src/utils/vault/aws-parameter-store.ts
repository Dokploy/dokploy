import {
	DescribeParametersCommand,
	GetParametersCommand,
	paginateDescribeParameters,
	SSMClient,
} from "@aws-sdk/client-ssm";
import type { awsParameterStoreVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import type { VaultClient } from "./types";

type AwsParameterStoreConfig = z.infer<
	typeof awsParameterStoreVaultConfigSchema
>;

const MAX_PARAMETERS_PER_REQUEST = 10;

const normalizeParameterPath = (path: string | undefined) => {
	const trimmed = path?.trim();
	if (!trimmed) {
		return undefined;
	}
	if (trimmed === "/") {
		return trimmed;
	}
	return trimmed.replace(/\/+$/, "");
};

const describeParametersInput = (config: AwsParameterStoreConfig) => {
	const parameterPath = normalizeParameterPath(config.parameterPath);
	return parameterPath
		? {
				ParameterFilters: [
					{
						Key: "Path",
						Option: "Recursive",
						Values: [parameterPath],
					},
				],
			}
		: {};
};

const isAccessDeniedError = (error: unknown) =>
	error instanceof Error &&
	(error.name === "AccessDeniedException" || error.name === "AccessDenied");

const createClient = (config: AwsParameterStoreConfig) =>
	new SSMClient({
		region: config.region,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
		...(config.endpoint && { endpoint: config.endpoint }),
	});

const findRequestedRef = (
	refs: string[],
	parameter: { Name?: string; ARN?: string; Selector?: string },
) => {
	const bases = [parameter.Name, parameter.ARN].filter(
		(value): value is string => Boolean(value),
	);
	if (!parameter.Selector) {
		return refs.find((ref) => bases.includes(ref));
	}

	const selector = parameter.Name
		? parameter.Selector.replace(`${parameter.Name}:`, "").replace(/^:/, "")
		: parameter.Selector.replace(/^:/, "");
	return refs.find((ref) =>
		bases.some((base) => ref === `${base}:${selector}`),
	);
};

export const awsParameterStoreClient: VaultClient<AwsParameterStoreConfig> = {
	async getSecrets(config, refs) {
		const client = createClient(config);
		const missingRefs = new Set(refs);
		const uniqueRefs = [...missingRefs];
		const result: Record<string, string> = {};

		for (
			let index = 0;
			index < uniqueRefs.length;
			index += MAX_PARAMETERS_PER_REQUEST
		) {
			const batch = uniqueRefs.slice(index, index + MAX_PARAMETERS_PER_REQUEST);
			const response = await client.send(
				new GetParametersCommand({
					Names: batch,
					WithDecryption: true,
				}),
			);

			for (const parameter of response.Parameters ?? []) {
				const ref = findRequestedRef(batch, parameter);
				if (!ref) {
					continue;
				}
				if (parameter.Value === undefined) {
					throw new Error(
						`AWS Parameter Store: parameter "${ref}" has no value`,
					);
				}
				result[ref] = parameter.Value;
				missingRefs.delete(ref);
			}
		}

		if (missingRefs.size > 0) {
			const noun = missingRefs.size === 1 ? "parameter" : "parameters";
			const refs = [...missingRefs].map((ref) => `"${ref}"`).join(", ");
			throw new Error(`AWS Parameter Store: ${noun} ${refs} not found`);
		}

		return result;
	},

	async testConnection(config) {
		const client = createClient(config);
		try {
			await client.send(
				new DescribeParametersCommand({
					...describeParametersInput(config),
					MaxResults: 1,
				}),
			);
		} catch (error) {
			if (isAccessDeniedError(error)) {
				throw new Error(
					"AWS Parameter Store: credentials were accepted, but connection testing and parameter discovery require ssm:DescribeParameters. Manual references can still work when ssm:GetParameters is allowed.",
				);
			}
			throw error;
		}
	},

	async listSecretNames(config) {
		const client = createClient(config);
		const names: string[] = [];
		for await (const page of paginateDescribeParameters(
			{ client, pageSize: 50 },
			describeParametersInput(config),
		)) {
			for (const parameter of page.Parameters ?? []) {
				if (parameter.Name) {
					names.push(parameter.Name);
				}
				if (names.length >= 500) {
					return names;
				}
			}
		}
		return names;
	},
};
