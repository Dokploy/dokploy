import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { ExternalLink, GlobeIcon, PenBoxIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { AddDomainCompose } from "./add-domain";

interface Props {
	composeId: string;
}

export const ShowDomainsCompose = ({ composeId }: Props) => {
	const { data, refetch } = api.domain.byComposeId.useQuery(
		{
			composeId,
		},
		{
			enabled: !!composeId,
		},
	);

	const { mutateAsync: deleteDomain, isLoading: isRemoving } =
		api.domain.delete.useMutation();

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center flex-wrap gap-4 justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle className="text-xl">Domains</CardTitle>
						<CardDescription>
							Domains are used to access to the application
						</CardDescription>
					</div>

					<div className="flex flex-row gap-4 flex-wrap">
						{data && data?.length > 0 && (
							<AddDomainCompose composeId={composeId}>
								<Button>
									<GlobeIcon className="size-4" /> Add Domain
								</Button>
							</AddDomainCompose>
						)}
					</div>
				</CardHeader>
				<CardContent className="flex w-full flex-row gap-4">
					{data?.length === 0 ? (
						<div className="flex w-full flex-col items-center justify-center gap-3">
							<GlobeIcon className="size-8 text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To access to the application it is required to set at least 1
								domain
							</span>
							<div className="flex flex-row gap-4 flex-wrap">
								<AddDomainCompose composeId={composeId}>
									<Button>
										<GlobeIcon className="size-4" /> Add Domain
									</Button>
								</AddDomainCompose>
							</div>
						</div>
					) : (
						<div className="flex w-full flex-col gap-4">
							{data?.map((item) => {
								return (
									<div
										key={item.domainId}
										className="flex w-full items-center justify-between gap-4 border p-4 md:px-6 rounded-lg flex-wrap"
									>
										<div className="md:basis-1/2 flex gap-6 w-full items-center">
											<span className="opacity-50 text-center font-medium text-sm whitespace-nowrap">
												{item.serviceName}
											</span>

											<Link
												className="flex gap-2 items-center hover:underline transition-all w-full max-w-[calc(100%-4rem)]"
												target="_blank"
												href={`${item.https ? "https" : "http"}://${item.host}${item.path}`}
											>
												<span className="truncate  text-sm">{item.host}</span>
												<ExternalLink className="size-4 min-w-4" />
											</Link>
										</div>

										<div className="flex gap-8">
											<div className="flex gap-8 opacity-50 items-center h-10 text-center text-sm font-medium">
												<span>{item.path}</span>
												<span>{item.port}</span>
												<span>{item.https ? "HTTPS" : "HTTP"}</span>
											</div>

											<div className="flex gap-2">
												<AddDomainCompose
													composeId={composeId}
													domainId={item.domainId}
												>
													<Button
														variant="ghost"
														size="icon"
														className="group hover:bg-blue-500/10 "
													>
														<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
													</Button>
												</AddDomainCompose>
												<DialogAction
													title="Delete Domain"
													description="Are you sure you want to delete this domain?"
													type="destructive"
													onClick={async () => {
														await deleteDomain({
															domainId: item.domainId,
														})
															.then((data) => {
																refetch();
																toast.success("Domain deleted successfully");
															})
															.catch(() => {
																toast.error("Error deleting domain");
															});
													}}
												>
													<Button
														variant="ghost"
														size="icon"
														className="group hover:bg-red-500/10"
														isLoading={isRemoving}
													>
														<Trash2 className="size-4 text-primary group-hover:text-red-500" />
													</Button>
												</DialogAction>
											</div>
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
