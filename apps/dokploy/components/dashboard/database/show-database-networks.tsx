import { Info } from "lucide-react";
import { AssignNetworkToResource } from "@/components/dashboard/network/assign-network-to-resource";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";

interface Props {
	databaseId: string;
	databaseType: "postgres" | "mysql" | "mariadb" | "mongo" | "redis";
}

export const ShowDatabaseNetworks = ({ databaseId, databaseType }: Props) => {
	const postgresQuery = api.postgres.one.useQuery(
		{ postgresId: databaseId },
		{ enabled: databaseType === "postgres" },
	);
	const mysqlQuery = api.mysql.one.useQuery(
		{ mysqlId: databaseId },
		{ enabled: databaseType === "mysql" },
	);
	const mariadbQuery = api.mariadb.one.useQuery(
		{ mariadbId: databaseId },
		{ enabled: databaseType === "mariadb" },
	);
	const mongoQuery = api.mongo.one.useQuery(
		{ mongoId: databaseId },
		{ enabled: databaseType === "mongo" },
	);
	const redisQuery = api.redis.one.useQuery(
		{ redisId: databaseId },
		{ enabled: databaseType === "redis" },
	);

	const data =
		postgresQuery.data ||
		mysqlQuery.data ||
		mariadbQuery.data ||
		mongoQuery.data ||
		redisQuery.data;

	if (!data) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Network Configuration</CardTitle>
				<CardDescription>
					Manage network connectivity for this database
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Alert>
					<Info className="h-4 w-4" />
					<AlertDescription>
						Databases are deployed as Docker Swarm services and can only use{" "}
						<strong>overlay</strong> networks. Only overlay networks are shown
						below.
					</AlertDescription>
				</Alert>

				<AssignNetworkToResource
					resourceId={databaseId}
					resourceType={databaseType}
				/>
				{data.customNetworkIds && data.customNetworkIds.length > 0 && (
					<div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3">
						<p className="text-sm text-blue-900 dark:text-blue-100">
							<strong>Network Isolation Active:</strong> This database is
							disconnected from{" "}
							<code className="relative rounded bg-blue-100 dark:bg-blue-900 px-[0.3rem] py-[0.2rem] font-mono text-xs">
								dokploy-network
							</code>{" "}
							and only accessible through the custom networks assigned above.
						</p>
						<p className="text-xs text-blue-800 dark:text-blue-200 mt-2">
							This enhances security by limiting connectivity to explicitly
							allowed networks only.
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
