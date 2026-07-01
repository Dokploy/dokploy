import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import type { ServiceType } from "@dokploy/server/db/schema";

export type BindMountServiceContext = {
	appName: string;
	serverId?: string | null;
	serviceType: ServiceType;
};

const isPathInsideDirectory = (basePath: string, candidatePath: string) => {
	const relativePath = path.relative(basePath, candidatePath);
	return (
		relativePath !== "" &&
		!relativePath.startsWith("..") &&
		!path.isAbsolute(relativePath)
	);
};

const isPathInsideOrEqualDirectory = (
	basePath: string,
	candidatePath: string,
) =>
	candidatePath === basePath || isPathInsideDirectory(basePath, candidatePath);

const pathExists = (candidatePath: string) => {
	try {
		return fs.existsSync(candidatePath);
	} catch {
		return false;
	}
};

const findNearestExistingPath = (
	candidatePath: string,
	serviceRoot: string,
) => {
	let currentPath = candidatePath;

	while (!pathExists(currentPath)) {
		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) {
			return null;
		}
		currentPath = parentPath;

		if (!isPathInsideOrEqualDirectory(serviceRoot, currentPath)) {
			return pathExists(serviceRoot) ? serviceRoot : null;
		}
	}

	return currentPath;
};

const assertExistingPathComponentsStayInsideServiceRoot = (
	basePath: string,
	serviceRoot: string,
	resolvedHostPath: string,
) => {
	try {
		const realBasePath = pathExists(basePath)
			? fs.realpathSync.native(basePath)
			: basePath;
		const realServiceRoot = pathExists(serviceRoot)
			? fs.realpathSync.native(serviceRoot)
			: serviceRoot;

		if (
			pathExists(serviceRoot) &&
			!isPathInsideDirectory(realBasePath, realServiceRoot)
		) {
			throw new Error("Invalid bind mount host path");
		}

		const nearestExistingPath = findNearestExistingPath(
			resolvedHostPath,
			serviceRoot,
		);
		if (!nearestExistingPath) {
			return;
		}

		const realNearestExistingPath = fs.realpathSync.native(nearestExistingPath);
		if (
			!isPathInsideOrEqualDirectory(realServiceRoot, realNearestExistingPath)
		) {
			throw new Error("Invalid bind mount host path");
		}
	} catch {
		throw new Error("Invalid bind mount host path");
	}
};

const getBindMountBasePath = ({
	serverId,
	serviceType,
}: BindMountServiceContext) => {
	const servicePaths = paths(!!serverId);
	return path.resolve(
		serviceType === "compose"
			? servicePaths.COMPOSE_PATH
			: servicePaths.APPLICATIONS_PATH,
	);
};

export const getBindMountHostRoot = ({
	appName,
	...context
}: BindMountServiceContext) => {
	if (!appName) {
		throw new Error("Invalid bind mount service context");
	}

	const absoluteBasePath = getBindMountBasePath({
		appName,
		...context,
	});
	const serviceRoot = path.resolve(absoluteBasePath, appName);

	if (!isPathInsideDirectory(absoluteBasePath, serviceRoot)) {
		throw new Error("Invalid bind mount service context");
	}

	return serviceRoot;
};

export const normalizeBindMountHostPath = (
	hostPath: string | null | undefined,
	context: BindMountServiceContext,
) => {
	const candidatePath = hostPath?.trim();
	if (!candidatePath || candidatePath.includes("\0")) {
		throw new Error("Invalid bind mount host path");
	}

	if (!path.isAbsolute(candidatePath)) {
		throw new Error("Invalid bind mount host path");
	}

	const basePath = getBindMountBasePath(context);
	const serviceRoot = getBindMountHostRoot(context);
	const resolvedHostPath = path.resolve(candidatePath);

	if (!isPathInsideDirectory(serviceRoot, resolvedHostPath)) {
		throw new Error("Invalid bind mount host path");
	}

	assertExistingPathComponentsStayInsideServiceRoot(
		basePath,
		serviceRoot,
		resolvedHostPath,
	);

	return resolvedHostPath;
};
