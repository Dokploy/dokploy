import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { Server, ShieldCheck } from "lucide-react";
import { AddRegistry } from "./add-docker-registry";
import { AddSelfRegistry } from "./add-self-registry";

export const ShowRegistry = () => {
	const { data } = api.certificates.all.useQuery();

	return (
		<div className="h-full">
			<Card className="bg-transparent h-full">
				<CardHeader>
					<CardTitle className="text-xl">Clusters</CardTitle>
					<CardDescription>Add cluster to your application.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 pt-4 h-full">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<Server className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To create a cluster is required to set a registry.
							</span>

							<div className="flex flex-row gap-2">
								<AddSelfRegistry />
								<AddRegistry />
							</div>

							{/* <AddCertificate /> */}
						</div>
					) : (
						<div className="flex flex-col gap-6">
							{data?.map((destination, index) => (
								<div
									key={destination.certificateId}
									className="flex items-center justify-between"
								>
									<span className="text-sm text-muted-foreground">
										{index + 1}. {destination.name}
									</span>
									<div className="flex flex-row gap-3">
										{/* <DeleteCertificate
											certificateId={destination.certificateId}
										/> */}
									</div>
								</div>
							))}
							<div>{/* <AddCertificate /> */}</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
