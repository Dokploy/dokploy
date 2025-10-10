import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2, Network, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AssignNetworkToResource } from "@/components/dashboard/network/assign-network-to-resource";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
}

const isolatedSchema = z.object({
	isolatedDeployment: z.boolean().optional(),
});

type IsolatedSchema = z.infer<typeof isolatedSchema>;

export const ShowComposeNetworks = ({ composeId }: Props) => {
	const utils = api.useUtils();
	const [compose, setCompose] = useState("");
	const [isPreviewLoading, setIsPreviewLoading] = useState(false);
	const [isOpenPreview, setIsOpenPreview] = useState(false);

	const {
		mutateAsync: generatePreviewMutation,
		error,
		isError,
	} = api.compose.isolatedDeployment.useMutation();
	const { mutateAsync: updateCompose } = api.compose.update.useMutation();
	const { data } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);

	const form = useForm<IsolatedSchema>({
		defaultValues: {
			isolatedDeployment: false,
		},
		resolver: zodResolver(isolatedSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				isolatedDeployment: data?.isolatedDeployment || false,
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (formData: IsolatedSchema) => {
		try {
			await updateCompose({
				composeId,
				isolatedDeployment: formData?.isolatedDeployment || false,
			});
			await utils.compose.one.invalidate({ composeId });
			toast.success("Network configuration updated");
		} catch {
			toast.error("Error updating network configuration");
		}
	};

	const generatePreview = async () => {
		setIsOpenPreview(true);
		setIsPreviewLoading(true);
		try {
			const preview = await generatePreviewMutation({
				composeId,
				suffix: data?.appName || "",
			});
			await utils.project.all.invalidate();
			setCompose(preview);
		} catch {
			toast.error("Error generating preview");
			setIsOpenPreview(false);
		} finally {
			setIsPreviewLoading(false);
		}
	};

	if (!data) return null;

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Network Configuration</CardTitle>
				<CardDescription>
					Configure how this compose service connects to Docker networks
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<div className="space-y-4">
							<FormField
								control={form.control}
								name="isolatedDeployment"
								render={({ field }) => (
									<FormItem className="flex flex-row items-start justify-between rounded-lg border p-4 shadow-sm">
										<div className="space-y-1 pr-4">
											<FormLabel className="text-base font-semibold">
												Auto-Managed Isolated Network
											</FormLabel>
											<FormDescription className="text-sm">
												Automatically create a dedicated network named{" "}
												<code className="relative rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
													{data.appName}
												</code>{" "}
												for complete isolation
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>

							{data.isolatedDeployment && (
								<div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4 space-y-3">
									<div className="flex items-start gap-2">
										<Network className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
										<div className="space-y-2 flex-1">
											<h4 className="font-semibold text-blue-900 dark:text-blue-100">
												Isolated Network Active
											</h4>
											<p className="text-sm text-blue-800 dark:text-blue-200">
												Network{" "}
												<code className="relative rounded bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 font-mono text-xs">
													{data.appName}
												</code>{" "}
												will be:
											</p>
											<ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 ml-1">
												<li className="flex items-start gap-2">
													<span className="text-blue-600 dark:text-blue-400 mt-0.5">
														•
													</span>
													<span>Created automatically in Docker</span>
												</li>
												<li className="flex items-start gap-2">
													<span className="text-blue-600 dark:text-blue-400 mt-0.5">
														•
													</span>
													<span>Saved in Dokploy database for management</span>
												</li>
												<li className="flex items-start gap-2">
													<span className="text-blue-600 dark:text-blue-400 mt-0.5">
														•
													</span>
													<span>Connected to Traefik for routing</span>
												</li>
												<li className="flex items-start gap-2">
													<span className="text-blue-600 dark:text-blue-400 mt-0.5">
														•
													</span>
													<span>Visible in the Networks tab</span>
												</li>
											</ul>
										</div>
									</div>
								</div>
							)}

							<div className="flex justify-end">
								<Button
									type="submit"
									isLoading={form.formState.isSubmitting}
									className="w-fit"
								>
									Save Configuration
								</Button>
							</div>
						</div>
					</form>
				</Form>

				<div className="relative">
					<div className="absolute inset-0 flex items-center">
						<span className="w-full border-t" />
					</div>
					<div className="relative flex justify-center text-xs uppercase">
						<span className="bg-background px-2 text-muted-foreground">
							{data.isolatedDeployment
								? "Additional Networks"
								: "Custom Networks"}
						</span>
					</div>
				</div>

				<div className="space-y-4">
					<div className="flex items-start gap-3">
						<Plus className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
						<div className="space-y-1 flex-1">
							<h3 className="text-base font-semibold">
								{data.isolatedDeployment
									? "Connect to Additional Networks"
									: "Assign Custom Networks"}
							</h3>
							<p className="text-sm text-muted-foreground">
								{data.isolatedDeployment
									? "Add more networks for shared resources like databases or internal services"
									: "Choose which Docker networks this service should connect to"}
							</p>
						</div>
					</div>

					<AssignNetworkToResource
						resourceId={composeId}
						resourceType="compose"
						composeType={data.composeType}
					/>

					<div className="flex justify-end">
						<Button
							type="button"
							onClick={generatePreview}
							isLoading={isPreviewLoading}
							variant="outline"
							className="w-fit"
						>
							Preview Full Configuration
						</Button>
					</div>

					{data.customNetworkIds && data.customNetworkIds.length > 0 && (
						<div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30 p-3">
							<div className="flex items-start gap-2">
								<Info className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
								<p className="text-sm text-green-900 dark:text-green-100">
									{data.isolatedDeployment ? (
										<>
											<strong>Hybrid Mode:</strong> Using auto-managed network{" "}
											<code className="relative rounded bg-green-100 dark:bg-green-900 px-1.5 py-0.5 font-mono text-xs">
												{data.appName}
											</code>{" "}
											+ {data.customNetworkIds.length} additional network
											{data.customNetworkIds.length > 1 ? "s" : ""}
										</>
									) : (
										<>
											<strong>Custom Mode:</strong> Using{" "}
											{data.customNetworkIds.length} custom network
											{data.customNetworkIds.length > 1 ? "s" : ""} only
										</>
									)}
								</p>
							</div>
						</div>
					)}
				</div>

				<Dialog open={isOpenPreview} onOpenChange={setIsOpenPreview}>
					<DialogContent className="sm:max-w-6xl max-h-[80vh]">
						<DialogHeader>
							<DialogTitle>Complete Network Configuration Preview</DialogTitle>
							<DialogDescription>
								Preview of the compose file with all network configurations
								applied (isolated deployment + custom networks)
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-4 overflow-auto">
							{isPreviewLoading ? (
								<div className="flex flex-col items-center justify-center py-12 gap-4">
									<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
									<p className="text-muted-foreground">
										Generating compose preview...
									</p>
								</div>
							) : (
								<pre>
									<CodeEditor
										value={compose || ""}
										language="yaml"
										readOnly
										height="60vh"
									/>
								</pre>
							)}
						</div>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
};
