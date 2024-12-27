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
import { DeleteRegistry } from "./delete-registry";
import { UpdateDockerRegistry } from "./update-docker-registry";

export const ShowRegistry = () => {
	const { data } = api.registry.all.useQuery();

	const haveSelfHostedRegistry = data?.some(
		(registry) => registry.registryType === "selfHosted",
	);

	return (
		<div className="h-full">
			<Card className="h-full bg-transparent">
				<CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
					<div className="flex flex-col gap-2">
						<CardTitle className="text-xl">Registry</CardTitle>
						<CardDescription>Add registry to your application.</CardDescription>
					</div>

					<div className="flex flex-row gap-2">
						{data && data?.length > 0 && <AddRegistry />}
					</div>
				</CardHeader>
				<CardContent className="h-full space-y-2 pt-4">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<Server className="size-8 self-center text-muted-foreground" />
							<span className="text-center text-base text-muted-foreground">
								To create a cluster it is required to set a registry.
							</span>

							<div className="flex w-full flex-row flex-wrap justify-center gap-2 md:flex-row">
								<AddRegistry />
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-1">
							{data?.map((registry, index) => (
								<div
									key={registry.registryId}
									className="flex items-center justify-between rounded-lg border p-4"
								>
									<span className="text-muted-foreground text-sm">
										{index + 1}. {registry.registryName}
									</span>
									<div className="flex flex-row gap-1">
										<UpdateDockerRegistry registryId={registry.registryId} />
										<DeleteRegistry registryId={registry.registryId} />
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
