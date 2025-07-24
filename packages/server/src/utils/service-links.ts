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
} from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

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
	attribute: string
): Promise<string | null> {
	const service = await getServiceDetails(serviceId, serviceType);
	if (!service) return null;

	switch (attribute) {
		case "fqdn": {
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