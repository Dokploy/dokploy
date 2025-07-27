import { db } from "@dokploy/server/db";
import { 
	applications,
	compose,
	postgres,
	mysql,
	mariadb,
	mongo,
	redis,
	domains,
	serviceLinks,
} from "@dokploy/server/db/schema";
import { eq, or, and } from "drizzle-orm";

// Helper function to get service details regardless of service type
export async function getServiceDetails(serviceId: string, serviceType: string) {
	switch (serviceType) {
		case "application": {
			const [service] = await db
				.select()
				.from(applications)
				.where(eq(applications.applicationId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "compose": {
			const [service] = await db
				.select()
				.from(compose)
				.where(eq(compose.composeId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "postgres": {
			const [service] = await db
				.select()
				.from(postgres)
				.where(eq(postgres.postgresId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "mysql": {
			const [service] = await db
				.select()
				.from(mysql)
				.where(eq(mysql.mysqlId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "mariadb": {
			const [service] = await db
				.select()
				.from(mariadb)
				.where(eq(mariadb.mariadbId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "mongo": {
			const [service] = await db
				.select()
				.from(mongo)
				.where(eq(mongo.mongoId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "redis": {
			const [service] = await db
				.select()
				.from(redis)
				.where(eq(redis.redisId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		default:
			return null;
	}
}

// Helper function to resolve service attribute values
export async function resolveServiceAttribute(
	serviceId: string,
	serviceType: string,
	attribute: string,
	previewDeploymentContext?: { appName: string; domain?: string }
): Promise<string | null> {
	const service = await getServiceDetails(serviceId, serviceType);
	if (!service) return null;

	switch (attribute) {
		case "fqdn": {
			// If in preview context, use preview domain
			if (previewDeploymentContext?.domain) {
				const protocol = "https"; // Preview deployments typically use HTTPS
				return `${protocol}://${previewDeploymentContext.domain}`;
			}

			// Get the primary domain for this service
			const [domain] = await db
				.select()
				.from(domains)
				.where(
					serviceType === "application"
						? eq(domains.applicationId, serviceId)
						: eq(domains.composeId, serviceId)
				)
				.limit(1);
			
			if (!domain) return null;
			
			const protocol = domain.https ? "https" : "http";
			const port = domain.port && domain.port !== 80 && domain.port !== 443 ? `:${domain.port}` : "";
			return `${protocol}://${domain.host}${port}${domain.path || ""}`;
		}
		case "hostname": {
			// For preview deployments, use the preview app name
			if (previewDeploymentContext?.appName) {
				return previewDeploymentContext.appName;
			}
			// For internal hostname, we use the appName which is used for container networking
			return (service as any).appName || null;
		}
		case "port": {
			// For internal port, we need to look at the service configuration
			// This is service-specific and might need additional logic
			if (serviceType === "postgres") return "5432";
			if (serviceType === "mysql") return "3306";
			if (serviceType === "mariadb") return "3306";
			if (serviceType === "mongo") return "27017";
			if (serviceType === "redis") return "6379";
			// For applications and compose, we might need additional logic
			return "3000"; // Default fallback
		}
		default:
			return null;
	}
}

// Helper function to find all services linked to a given service (both as source and target)
export async function getLinkedServices(serviceId: string, serviceType: string) {
	// Find services that this service links to (as source)
	const outgoingLinks = await db
		.select()
		.from(serviceLinks)
		.where(
			and(
				eq(serviceLinks.sourceServiceId, serviceId),
				eq(serviceLinks.sourceServiceType, serviceType as any)
			)
		);

	// Find services that link to this service (as target)
	const incomingLinks = await db
		.select()
		.from(serviceLinks)
		.where(
			and(
				eq(serviceLinks.targetServiceId, serviceId),
				eq(serviceLinks.targetServiceType, serviceType as any)
			)
		);

	// Collect all unique linked service IDs
	const linkedServiceIds = new Set<{ serviceId: string; serviceType: string }>();
	
	for (const link of outgoingLinks) {
		linkedServiceIds.add({
			serviceId: link.targetServiceId,
			serviceType: link.targetServiceType
		});
	}

	for (const link of incomingLinks) {
		linkedServiceIds.add({
			serviceId: link.sourceServiceId,
			serviceType: link.sourceServiceType
		});
	}

	// Get service details for each linked service
	const linkedServices = [];
	for (const { serviceId: linkedServiceId, serviceType: linkedServiceType } of linkedServiceIds) {
		const serviceDetails = await getServiceDetails(linkedServiceId, linkedServiceType);
		if (serviceDetails) {
			linkedServices.push({
				...serviceDetails,
				serviceType: linkedServiceType
			});
		}
	}

	return {
		linkedServices,
		outgoingLinks,
		incomingLinks,
		allLinks: [...outgoingLinks, ...incomingLinks]
	};
}

// Helper function to get all services that should be deployed together for preview deployments
export async function getServiceCluster(serviceId: string, serviceType: string): Promise<Array<{ serviceId: string; serviceType: string; projectId: string }>> {
	const visited = new Set<string>();
	const serviceCluster: Array<{ serviceId: string; serviceType: string; projectId: string }> = [];

	async function addServiceToCluster(id: string, type: string) {
		const key = `${type}:${id}`;
		if (visited.has(key)) return;
		visited.add(key);

		const service = await getServiceDetails(id, type);
		if (!service) return;

		serviceCluster.push({
			serviceId: id,
			serviceType: type,
			projectId: service.projectId
		});

		// Find all linked services
		const { linkedServices } = await getLinkedServices(id, type);
		
		// Recursively add linked services
		for (const linkedService of linkedServices) {
			await addServiceToCluster(
				(linkedService as any).applicationId || 
				(linkedService as any).composeId || 
				(linkedService as any).postgresId || 
				(linkedService as any).mysqlId || 
				(linkedService as any).mariadbId || 
				(linkedService as any).mongoId || 
				(linkedService as any).redisId,
				linkedService.serviceType
			);
		}
	}

	await addServiceToCluster(serviceId, serviceType);
	return serviceCluster;
}