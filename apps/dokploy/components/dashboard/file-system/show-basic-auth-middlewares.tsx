import copy from "copy-to-clipboard";
import { Copy, LockKeyhole, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { HandleBasicAuthMiddleware } from "./handle-basic-auth-middleware";

interface Props {
	serverId?: string;
}

export const ShowBasicAuthMiddlewares = ({ serverId }: Props) => {
	const { data, refetch, isLoading } =
		api.settings.listBasicAuthMiddlewares.useQuery({ serverId });

	const { mutateAsync: deleteMiddleware, isPending: isRemoving } =
		api.settings.deleteBasicAuthMiddleware.useMutation();

	return (
		<Card className="bg-sidebar p-2.5 rounded-xl">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader className="flex flex-row justify-between flex-wrap gap-4">
					<div>
						<CardTitle className="text-xl flex flex-row gap-2">
							<LockKeyhole className="size-6 text-muted-foreground self-center" />
							Basic Auth Middlewares
						</CardTitle>
						<CardDescription>
							Create reusable basic auth middlewares in{" "}
							{"'middlewares.yml'"}. Reference one in a Docker Compose label or
							on a domain's Middlewares field as{" "}
							<code className="text-xs">name@file</code>, then redeploy.
						</CardDescription>
					</div>

					{data && data.length > 0 && (
						<HandleBasicAuthMiddleware serverId={serverId}>
							Add Middleware
						</HandleBasicAuthMiddleware>
					)}
				</CardHeader>
				<CardContent className="flex flex-col gap-4 py-6 border-t">
					{isLoading ? (
						<div className="flex w-full flex-col items-center justify-center gap-3 py-10">
							<span className="text-muted-foreground text-sm">Loading...</span>
						</div>
					) : !data || data.length === 0 ? (
						<div className="flex w-full flex-col items-center justify-center gap-3 py-10">
							<LockKeyhole className="size-8 text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								No basic auth middlewares configured
							</span>
							<HandleBasicAuthMiddleware serverId={serverId}>
								Add Middleware
							</HandleBasicAuthMiddleware>
						</div>
					) : (
						<div className="flex flex-col gap-4">
							{data.map((middleware) => {
								const reference = `${middleware.name}@file`;
								return (
									<div
										key={middleware.name}
										className="flex flex-col md:flex-row md:items-center justify-between gap-4 border rounded-lg p-4"
									>
										<div className="flex flex-col gap-2">
											<div className="flex items-center gap-2">
												<span className="font-medium">{middleware.name}</span>
												<Button
													variant="ghost"
													size="icon"
													className="size-6"
													onClick={() => {
														copy(reference);
														toast.success(`Copied "${reference}"`);
													}}
													title={`Copy "${reference}"`}
												>
													<Copy className="size-3.5 text-muted-foreground" />
												</Button>
											</div>
											<span className="text-xs text-muted-foreground">
												{middleware.users.length > 0
													? `Users: ${middleware.users.join(", ")}`
													: "No users"}
											</span>
										</div>
										<DialogAction
											title="Delete Middleware"
											description={`Are you sure you want to delete "${middleware.name}"? Any compose services or domains referencing it will stop authenticating until redeployed.`}
											type="destructive"
											onClick={async () => {
												await deleteMiddleware({
													name: middleware.name,
													serverId,
												})
													.then(() => {
														refetch();
														toast.success("Middleware deleted");
													})
													.catch((error) => {
														toast.error(
															error?.message ?? "Error deleting middleware",
														);
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
								);
							})}
						</div>
					)}
				</CardContent>
			</div>
		</Card>
	);
};
