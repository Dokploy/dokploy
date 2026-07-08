import { IS_CLOUD } from "../../constants";
import {
	assertCloudHostResolvesPublic,
	type HostnameLookup,
} from "../url/network";

type ServerDestination = {
	ipAddress: string;
};

type ServerDestinationOptions = {
	allowPrivateNetwork?: boolean;
	fieldName?: string;
	lookup?: HostnameLookup;
};

export const assertServerDestinationAllowed = async (
	server: ServerDestination,
	options: ServerDestinationOptions = {},
) => {
	await resolveServerDestinationHost(server, options);
};

export const resolveServerDestinationHost = async (
	server: ServerDestination,
	options: ServerDestinationOptions = {},
) => {
	const allowPrivateNetwork = options.allowPrivateNetwork ?? !IS_CLOUD;
	if (allowPrivateNetwork) {
		return server.ipAddress;
	}

	const resolvedHost = await assertCloudHostResolvesPublic(server.ipAddress, {
		fieldName: options.fieldName ?? "Server address",
		lookup: options.lookup,
	});

	return resolvedHost.addresses[0]?.address ?? resolvedHost.hostname;
};
