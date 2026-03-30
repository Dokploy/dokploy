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
	applicationId: string;
}

const schema = z
	.object({
		buildServerId: z.string().optional(),
		buildRegistryId: z.string().optional(),
	})
	.refine(
		(data) => {
			// Both empty/none is valid
			const buildServerIsNone =
				!data.buildServerId || data.buildServerId === "none";
			const buildRegistryIsNone =
				!data.buildRegistryId || data.buildRegistryId === "none";

			// Both should be either filled or empty
			if (buildServerIsNone && buildRegistryIsNone) return true;
			if (!buildServerIsNone && !buildRegistryIsNone) return true;

			return false;
		},
		{
			message:
				"Both Build Server and Build Registry must be selected together, or both set to None",
			path: ["buildServerId"], // Show error on buildServerId field
		},
	);

type Schema = z.infer<typeof schema>;

export const ShowBuildServer = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);
	const { data: buildServers } = api.server.buildServers.useQuery();
	const { data: registries } = api.registry.all.useQuery();

	const { mutateAsync, isPending } = api.application.update.useMutation();

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
				buildServerId: data?.buildServerId || "",
				buildRegistryId: data?.buildRegistryId || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (formData: Schema) => {
		await mutateAsync({
			applicationId,
			buildServerId:
				formData?.buildServerId === "none" || !formData?.buildServerId
					? null
					: formData?.buildServerId,
			buildRegistryId:
				formData?.buildRegistryId === "none" || !formData?.buildRegistryId
					? null
					: formData?.buildRegistryId,
		})
			.then(async () => {
				toast.success("Build Server Settings Updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error updating build server settings");
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
							Configure a dedicated server for building your application.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					Build servers offload the build process from your deployment servers.
					Select a build server and registry to use for building your
					application.
				</AlertBlock>

				<AlertBlock type="info">
					📊 <strong>Important:</strong> Once the build finishes, you'll need to
					wait a few seconds for the deployment server to download the image.
					These download logs will <strong>NOT</strong> appear in the build
					deployment logs. Check the <strong>Logs</strong> tab to see when the
					container starts running.
				</AlertBlock>

				<AlertBlock type="info">
					<strong>Note:</strong> Build Server and Build Registry must be
					configured together. You can either select both or set both to None.
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
											// If setting to "none", also reset build registry to "none"
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
										Select a build server to handle the build process for this
										application.
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
											// If setting to "none", also reset build server to "none"
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
										Select a registry to store the built images from the build
										server.
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
