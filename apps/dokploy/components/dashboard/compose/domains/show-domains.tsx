import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
										className="flex w-full items-center gap-4 max-sm:flex-wrap border p-4 rounded-lg"
									>
										<Link target="_blank" href={`http://${item.host}`}>
											<ExternalLink className="size-5" />
										</Link>
										<Button variant="outline" disabled>
											{item.serviceName}
										</Button>
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
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
