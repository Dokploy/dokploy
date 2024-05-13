import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { Server } from "lucide-react";
import { AddRegistry } from "./add-docker-registry";
import { AddSelfHostedRegistry } from "./add-self-docker-registry";
import { DeleteRegistry } from "./delete-registry";

export const ShowRegistry = () => {
	const { data } = api.registry.all.useQuery();

	const haveSelfHostedRegistry = data?.some(
		(registry) => registry.registryType === "selfHosted",
	);

	return (
		<div className="h-full">
			<Card className="bg-transparent h-full">
				<CardHeader className="flex flex-row gap-2 justify-between w-full items-center">
					<div className="flex flex-col gap-2">
						<CardTitle className="text-xl">Clusters</CardTitle>
						<CardDescription>Add cluster to your application.</CardDescription>
					</div>

					<div className="flex flex-row gap-2">
						{data && data?.length > 0 && (
							<>
								{!haveSelfHostedRegistry && <AddSelfHostedRegistry />}

								<AddRegistry />
							</>
						)}
					</div>
				</CardHeader>
				<CardContent className="space-y-2 pt-4 h-full">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<Server className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To create a cluster is required to set a registry.
							</span>

							<div className="flex flex-row gap-2">
								<AddSelfHostedRegistry />
								<AddRegistry />
							</div>

							{/* <AddCertificate /> */}
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
							{data?.map((registry, index) => (
								<div
									key={registry.registryId}
									className="flex items-center justify-between border p-4 rounded-lg hover:bg-muted cursor-pointer"
								>
									<span className="text-sm text-muted-foreground">
										{index + 1}. {registry.registryName}
									</span>
									<div className="flex flex-row gap-3">
										<DeleteRegistry registryId={registry.registryId} />
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
