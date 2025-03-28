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
import { AddDomain } from "./add-domain";

interface Props {
	applicationId: string;
}

export const ShowDomains = ({ applicationId }: Props) => {
	const { data, refetch } = api.domain.byApplicationId.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
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
							<AddDomain applicationId={applicationId}>
								<Button>
									<GlobeIcon className="size-4" /> Add Domain
								</Button>
							</AddDomain>
						)}
					</div>
				</CardHeader>
				<CardContent className="flex w-full flex-row gap-4">
					{data?.length === 0 ? (
						<div className="flex w-full flex-col items-center justify-center gap-3">
							<GlobeIcon className="size-8 text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To access the application it is required to set at least 1
								domain
							</span>
							<div className="flex flex-row gap-4 flex-wrap">
								<AddDomain applicationId={applicationId}>
									<Button>
										<GlobeIcon className="size-4" /> Add Domain
									</Button>
								</AddDomain>
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
										<Link
											className="md:basis-1/2 flex gap-2  items-center hover:underline transition-all w-full"
											target="_blank"
											href={`${item.https ? "https" : "http"}://${item.host}${item.path}`}
										>
											<span className="truncate max-w-full text-sm">
												{item.host}
											</span>
											<ExternalLink className="size-4 min-w-4" />
										</Link>

										<div className="flex gap-8">
											<div className="flex gap-8 opacity-50 items-center h-10 text-center text-sm font-medium">
												<span>{item.path}</span>
												<span>{item.port}</span>
												<span>{item.https ? "HTTPS" : "HTTP"}</span>
											</div>

											<div className="flex gap-2">
												<AddDomain
													applicationId={applicationId}
													domainId={item.domainId}
												>
													<Button
														variant="ghost"
														size="icon"
														className="group hover:bg-blue-500/10 "
													>
														<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
													</Button>
												</AddDomain>
												<DialogAction
													title="Delete Domain"
													description="Are you sure you want to delete this domain?"
													type="destructive"
													onClick={async () => {
														await deleteDomain({
															domainId: item.domainId,
														})
															.then(() => {
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
