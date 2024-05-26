import React from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ExternalLink, GlobeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { Input } from "@/components/ui/input";
import { DeleteDomain } from "./delete-domain";
import Link from "next/link";
import { AddDomain } from "./add-domain";
import { UpdateDomain } from "./update-domain";

interface Props {
	applicationId: string;
}

export const ShowDomains = ({ applicationId }: Props) => {
	const { data } = api.domain.byApplicationId.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);
	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle className="text-xl">Domains</CardTitle>
						<CardDescription>
							Domains are used to access to the application
						</CardDescription>
					</div>

					{data && data?.length > 0 && (
						<AddDomain applicationId={applicationId}>
							<GlobeIcon className="size-4" /> Add Domain
						</AddDomain>
					)}
				</CardHeader>
				<CardContent className="flex w-full flex-row gap-4">
					{data?.length === 0 ? (
						<div className="flex w-full flex-col items-center justify-center gap-3">
							<GlobeIcon className="size-8 text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To access to the application is required to set at least 1
								domain
							</span>
							<AddDomain applicationId={applicationId}>
								<GlobeIcon className="size-4" /> Add Domain
							</AddDomain>
						</div>
					) : (
						<div className="flex w-full flex-col gap-4">
							{data?.map((item) => {
								return (
									<div
										key={item.domainId}
										className="flex w-full items-center gap-4 max-sm:flex-wrap border p-4 rounded-lg"
									>
										<Link target="_blank" href={`http://${item.host}`}>
											<ExternalLink className="size-5" />
										</Link>

										<Input disabled value={item.host} />
										<Button variant="outline" disabled>
											{item.path}
										</Button>
										<Button variant="outline" disabled>
											{item.port}
										</Button>
										<Button variant="outline" disabled>
											{item.https ? "HTTPS" : "HTTP"}
										</Button>
										<div className="flex flex-row gap-1">
											<UpdateDomain domainId={item.domainId} />
											<DeleteDomain domainId={item.domainId} />
										</div>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
