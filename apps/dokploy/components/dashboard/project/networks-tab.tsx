import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CreateNetwork } from "../network/create-network";
import { NetworkList } from "../network/network-list";

interface Props {
	projectId?: string;
}

export const NetworksTab = ({ projectId }: Props) => {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Custom Networks</CardTitle>
							<CardDescription>
								Manage Docker networks for service isolation and communication
								control
							</CardDescription>
						</div>
						<CreateNetwork projectId={projectId} />
					</div>
				</CardHeader>
				<CardContent>
					<NetworkList />
				</CardContent>
			</Card>
		</div>
	);
};
