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
	applicationId: string;
}

export const ShowApplicationNetworks = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery({ applicationId });

	if (!data) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Network Configuration</CardTitle>
				<CardDescription>
					Assign custom Docker networks to this application
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Alert>
					<Info className="h-4 w-4" />
					<AlertDescription>
						Applications are deployed as Docker Swarm services and can only use{" "}
						<strong>overlay</strong> networks. Only overlay networks are shown
						below.
					</AlertDescription>
				</Alert>

				<AssignNetworkToResource
					resourceId={applicationId}
					resourceType="application"
				/>

				{data.customNetworkIds && data.customNetworkIds.length > 0 && (
					<p className="text-sm text-muted-foreground">
						This application will not be connected to{" "}
						<code>dokploy-network</code> and will only use the networks assigned
						above.
					</p>
				)}
			</CardContent>
		</Card>
	);
};
