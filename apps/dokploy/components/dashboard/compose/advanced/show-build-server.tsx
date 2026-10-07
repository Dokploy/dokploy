import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Server } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
}

const isNone = (value?: string) => !value || value === "none";

const schema = z
	.object({
		buildServerId: z.string().optional(),
		buildRegistryId: z.string().optional(),
	})
	.refine(
		(data) => isNone(data.buildServerId) === isNone(data.buildRegistryId),
		{
			message:
				"Both Build Server and Build Registry must be selected together, or both set to None",
			path: ["buildServerId"],
		},
	);

type Schema = z.infer<typeof schema>;

export const ShowComposeBuildServer = ({ composeId }: Props) => {
	const { data, refetch } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);
	const { data: buildServers } = api.server.buildServers.useQuery();
	const { data: registries } = api.registry.all.useQuery();
	const { mutateAsync, isPending } = api.compose.update.useMutation();

	const form = useForm<Schema>({
		defaultValues: {
			buildServerId: data?.buildServerId || "",
			buildRegistryId: data?.buildRegistryId || "",
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				buildServerId: data.buildServerId || "",
				buildRegistryId: data.buildRegistryId || "",
			});
		}
	}, [form, data]);

	const onSubmit = async (formData: Schema) => {
		await mutateAsync({
			composeId,
			buildServerId: isNone(formData.buildServerId)
				? null
				: (formData.buildServerId as string),
			buildRegistryId: isNone(formData.buildRegistryId)
				? null
				: (formData.buildRegistryId as string),
		})
			.then(async () => {
				toast.success("Build Server Settings Updated");
				await refetch();
			})
			.catch((error: Error) => {
				toast.error(error.message || "Error updating build server settings");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<div className="flex flex-row items-center gap-2">
					<Server className="size-6 text-muted-foreground" />
					<div>
						<CardTitle className="text-xl">Build Server</CardTitle>
						<CardDescription>
							Build this compose's images on a dedicated server instead of the
							server that runs it.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					Every service with a <code>build:</code> section is built on the build
					server and pushed to the registry. The deployment server then only
					pulls the images and starts them (<code>--no-build</code>), so no
					build ever runs on it. The source is still cloned on the deployment
					server for bind mounts, configs and env files.
				</AlertBlock>

				<AlertBlock type="info">
					<strong>Note:</strong> Build Server and Build Registry must be
					configured together. The build output appears in the deployment log;
					the deployment server logs in to the registry and pulls the images
					with the same credentials. A custom compose command cannot be used
					together with a build server.
				</AlertBlock>

				{!registries || registries.length === 0 ? (
					<AlertBlock type="warning">
						You need to add at least one registry to use build servers. Please
						go to{" "}
						<Link
							href="/dashboard/settings/registry"
							className="text-primary underline"
						>
							Settings
						</Link>{" "}
						to add a registry.
					</AlertBlock>
				) : null}

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="buildServerId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Build Server</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
											if (value === "none") {
												form.setValue("buildRegistryId", "none");
											}
										}}
										value={field.value || "none"}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a build server" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="none">
													<span className="flex items-center gap-2">
														<span>None</span>
													</span>
												</SelectItem>
												{buildServers?.map((server) => (
													<SelectItem
														key={server.serverId}
														value={server.serverId}
													>
														<span className="flex items-center gap-2 justify-between w-full">
															<span>{server.name}</span>
															<span className="text-muted-foreground text-xs">
																{server.ipAddress}
															</span>
														</span>
													</SelectItem>
												))}
												<SelectLabel>
													Build Servers ({buildServers?.length || 0})
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormDescription>
										Only servers of type "build" can be selected.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="buildRegistryId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Build Registry</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
											if (value === "none") {
												form.setValue("buildServerId", "none");
											}
										}}
										value={field.value || "none"}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a registry" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="none">
													<span className="flex items-center gap-2">
														<span>None</span>
													</span>
												</SelectItem>
												{registries?.map((registry) => (
													<SelectItem
														key={registry.registryId}
														value={registry.registryId}
													>
														{registry.registryName}
													</SelectItem>
												))}
												<SelectLabel>
													Registries ({registries?.length || 0})
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormDescription>
										Registry the built images are pushed to and pulled from.
										Images are named{" "}
										<code>
											&lt;registry&gt;/&lt;app&gt;-&lt;service&gt;:&lt;tag&gt;
										</code>
										.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex w-full justify-end">
							<Button isLoading={isPending} type="submit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
