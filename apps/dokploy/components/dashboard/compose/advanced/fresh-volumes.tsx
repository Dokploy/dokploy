import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { AlertTriangle, Copy, HardDriveDownload } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const freshVolumesSchema = z.object({
	confirmName: z.string().min(1, {
		message: "Compose name is required",
	}),
});

type FreshVolumesForm = z.infer<typeof freshVolumesSchema>;

interface Props {
	composeId: string;
}

export const FreshVolumes = ({ composeId }: Props) => {
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canDeploy = permissions?.deployment.create ?? false;
	const { data, refetch } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);
	const { mutateAsync: deploy, isPending } = api.compose.deploy.useMutation();

	const form = useForm<FreshVolumesForm>({
		defaultValues: { confirmName: "" },
		resolver: zodResolver(freshVolumesSchema),
	});

	const expectedName = `${data?.name}/${data?.appName}`;
	const isRunning = data?.composeStatus === "running";

	const onSubmit = async (formData: FreshVolumesForm) => {
		if (formData.confirmName !== expectedName) {
			form.setError("confirmName", {
				message: `Compose name must match "${expectedName}"`,
			});
			return;
		}
		await deploy({ composeId, freshVolumes: true })
			.then(() => {
				toast.success("Compose deployed with fresh volumes");
				setIsOpen(false);
				form.reset();
				refetch();
				router.push(
					`/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/compose/${composeId}?tab=deployments`,
				);
			})
			.catch(() => {
				toast.error("Error deploying compose");
			});
	};

	if (!canDeploy || data?.composeType !== "docker-compose") return null;

	return (
		<Card className="bg-background border-destructive/50">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<AlertTriangle className="h-5 w-5 text-destructive" />
					Danger Zone
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<h3 className="text-base font-semibold">
							Deploy with Fresh Volumes
						</h3>
						<p className="text-sm text-muted-foreground">
							Permanently wipes every volume of this compose and redeploys it
							from a clean state. All persistent data (databases, uploads,
							caches) will be lost.
						</p>
					</div>
					<Dialog
						open={isOpen}
						onOpenChange={(open) => {
							setIsOpen(open);
							if (!open) form.reset();
						}}
					>
						<DialogTrigger asChild>
							<Button
								isLoading={isPending}
								variant="outline"
								className="w-full border-destructive/50 hover:bg-destructive/10 hover:text-destructive text-destructive"
							>
								<HardDriveDownload className="mr-2 h-4 w-4" />
								Deploy with Fresh Volumes
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-lg">
							<DialogHeader>
								<DialogTitle className="flex items-center gap-2">
									<AlertTriangle className="h-5 w-5 text-destructive" />
									Are you absolutely sure?
								</DialogTitle>
								<DialogDescription asChild>
									<div className="space-y-2">
										<p>This action will:</p>
										<ul className="list-disc list-inside space-y-1">
											<li>Stop the current compose</li>
											<li>Delete all volumes and their data</li>
											<li>Redeploy the compose with empty volumes</li>
										</ul>
										<p className="font-medium text-destructive mt-4">
											This action cannot be undone.
										</p>
									</div>
								</DialogDescription>
							</DialogHeader>
							<Form {...form}>
								<form
									onSubmit={form.handleSubmit(onSubmit)}
									id="hook-form-fresh-volumes"
									className="grid w-full gap-4"
								>
									<FormField
										control={form.control}
										name="confirmName"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="flex items-center gap-2">
													<span>
														To confirm, type{" "}
														<Badge
															className="p-2 rounded-md ml-1 mr-1 hover:border-primary hover:text-primary-foreground hover:bg-primary hover:cursor-pointer"
															variant="outline"
															onClick={() => {
																if (data?.name && data?.appName) {
																	copy(expectedName);
																	toast.success(
																		"Copied to clipboard. Be careful!",
																	);
																}
															}}
														>
															{expectedName}&nbsp;
															<Copy className="h-4 w-4 ml-1 text-muted-foreground" />
														</Badge>{" "}
														in the box below:
													</span>
												</FormLabel>
												<FormControl>
													<Input
														placeholder="Enter compose name to confirm"
														autoComplete="off"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</form>
							</Form>
							{isRunning && (
								<AlertBlock type="warning" className="w-full">
									Cannot deploy with fresh volumes while a deployment is
									running. Please wait for it to finish and then try again.
								</AlertBlock>
							)}
							<DialogFooter>
								<Button variant="secondary" onClick={() => setIsOpen(false)}>
									Cancel
								</Button>
								<Button
									isLoading={isPending}
									disabled={isRunning}
									form="hook-form-fresh-volumes"
									type="submit"
									variant="destructive"
								>
									Wipe volumes and deploy
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</CardContent>
		</Card>
	);
};
