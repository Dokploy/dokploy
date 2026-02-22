import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, PlusIcon, Server } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface Props {
	serviceId: string;
	serviceType:
		| "application"
		| "postgres"
		| "redis"
		| "mongo"
		| "redis"
		| "mysql"
		| "mariadb"
		| "compose";
	serverId?: string;
	refetch: () => void;
	children?: React.ReactNode;
}

const mountSchema = z.object({
	mountPath: z.string().min(1, "Mount path required"),
});

const mySchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("bind"),
			hostPath: z.string().min(1, "Host path required"),
		})
		.merge(mountSchema),
	z
		.object({
			type: z.literal("volume"),
			volumeName: z
				.string()
				.min(1, "Volume name required")
				.regex(
					/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
					"Invalid volume name. Use letters, numbers, '._-' and start with a letter/number.",
				),
		})
		.merge(mountSchema),
	z
		.object({
			type: z.literal("file"),
			filePath: z.string().min(1, "File path required"),
			content: z.string().optional(),
		})
		.merge(mountSchema),
	z
		.object({
			type: z.literal("nfs"),
			nfsServer: z.string().min(1, "NFS server address required"),
			nfsPath: z.string().min(1, "NFS export path required"),
			mountOptions: z.string().optional(),
			username: z.string().optional(),
			password: z.string().optional(),
			mountMethod: z
				.enum(["docker-volume", "host-mount"])
				.default("host-mount"),
			replicateToSwarm: z.boolean().default(false),
			targetNodes: z.array(z.string()).optional(),
		})
		.merge(mountSchema),
	z
		.object({
			type: z.literal("smb"),
			smbServer: z.string().min(1, "SMB server address required"),
			smbShare: z.string().min(1, "SMB share name required"),
			smbPath: z.string().optional(),
			mountOptions: z.string().optional(),
			username: z.string().min(1, "Username required for SMB"),
			password: z.string().min(1, "Password required for SMB"),
			domain: z.string().optional(),
			replicateToSwarm: z.boolean().default(false),
			targetNodes: z.array(z.string()).optional(),
		})
		.merge(mountSchema),
]);

type AddMount = z.infer<typeof mySchema>;

export const AddVolumes = ({
	serviceId,
	serviceType,
	serverId,
	refetch,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const { mutateAsync } = api.mounts.create.useMutation();
	const form = useForm<AddMount>({
		defaultValues: {
			type: serviceType === "compose" ? "file" : "bind",
			hostPath: "",
			mountPath: serviceType === "compose" ? "/" : "",
			mountMethod: "host-mount",
			replicateToSwarm: false,
			targetNodes: [],
		},
		resolver: zodResolver(mySchema),
	});
	const type = form.watch("type");
	const mountMethod = form.watch("mountMethod");
	const replicateToSwarm = form.watch("replicateToSwarm");
	const targetNodes = form.watch("targetNodes") || [];

	// Fetch available swarm nodes
	const { data: availableNodes, isLoading: nodesLoading } =
		api.mounts.getAvailableNodes.useQuery(
			{ serverId },
			{ enabled: (type === "nfs" || type === "smb") && !!serverId },
		);

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddMount) => {
		if (data.type === "bind") {
			await mutateAsync({
				serviceId,
				hostPath: data.hostPath,
				mountPath: data.mountPath,
				type: data.type,
				serviceType,
			})
				.then(() => {
					toast.success("Mount Created");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error creating the Bind mount");
				});
		} else if (data.type === "volume") {
			await mutateAsync({
				serviceId,
				volumeName: data.volumeName,
				mountPath: data.mountPath,
				type: data.type,
				serviceType,
			})
				.then(() => {
					toast.success("Mount Created");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error creating the Volume mount");
				});
		} else if (data.type === "file") {
			await mutateAsync({
				serviceId,
				content: data.content,
				mountPath: data.mountPath,
				filePath: data.filePath,
				type: data.type,
				serviceType,
			})
				.then(() => {
					toast.success("Mount Created");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error creating the File mount");
				});
		} else if (data.type === "nfs") {
			await mutateAsync({
				serviceId,
				nfsServer: data.nfsServer,
				nfsPath: data.nfsPath,
				mountPath: data.mountPath,
				mountOptions: data.mountOptions,
				mountMethod: data.mountMethod || "host-mount",
				type: data.type,
				serviceType,
				username: data.username,
				password: data.password,
				replicateToSwarm: data.replicateToSwarm || false,
				targetNodes: data.replicateToSwarm ? data.targetNodes : undefined,
			})
				.then(() => {
					toast.success("NFS Mount Created");
					setIsOpen(false);
				})
				.catch((err) => {
					toast.error(
						`Error creating the NFS mount: ${
							err instanceof Error ? err.message : "Unknown error"
						}`,
					);
				});
		} else if (data.type === "smb") {
			await mutateAsync({
				serviceId,
				smbServer: data.smbServer,
				smbShare: data.smbShare,
				smbPath: data.smbPath,
				mountPath: data.mountPath,
				mountOptions: data.mountOptions,
				type: data.type,
				serviceType,
				username: data.username,
				password: data.password,
				domain: data.domain,
				replicateToSwarm: data.replicateToSwarm || false,
				targetNodes: data.replicateToSwarm ? data.targetNodes : undefined,
			})
				.then(() => {
					toast.success("SMB Mount Created");
					setIsOpen(false);
				})
				.catch((err) => {
					toast.error(
						`Error creating the SMB mount: ${
							err instanceof Error ? err.message : "Unknown error"
						}`,
					);
				});
		}

		refetch();
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<Button>{children}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Volumes / Mounts</DialogTitle>
				</DialogHeader>
				{/* {isError && (
        <div className="flex items-center flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
          <AlertTriangle className="text-red-600 dark:text-red-400" />
          <span className="text-sm text-red-600 dark:text-red-400">
            {error?.message}
          </span>
        </div>
      )} */}

				<Form {...form}>
					<form
						id="hook-form-volume"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						{type === "bind" && (
							<AlertBlock>
								<div className="space-y-2">
									<p>
										Make sure the host path is a valid path and exists in the
										host machine.
									</p>
									<p className="text-sm text-muted-foreground">
										<strong>Cluster Warning:</strong> If you're using cluster
										features, bind mounts may cause deployment failures since
										the path must exist on all worker/manager nodes. Consider
										using external tools to distribute the folder across nodes
										or use named volumes instead.
									</p>
								</div>
							</AlertBlock>
						)}
						<FormField
							control={form.control}
							defaultValue={form.control._defaultValues.type}
							name="type"
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel className="text-muted-foreground">
										Select the Mount Type
									</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											defaultValue={field.value}
											className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
										>
											{serviceType !== "compose" && (
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value="bind"
																id="bind"
																className="peer sr-only"
															/>
															<Label
																htmlFor="bind"
																className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																Bind Mount
															</Label>
														</div>
													</FormControl>
												</FormItem>
											)}

											{serviceType !== "compose" && (
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value="volume"
																id="volume"
																className="peer sr-only"
															/>
															<Label
																htmlFor="volume"
																className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																Volume Mount
															</Label>
														</div>
													</FormControl>
												</FormItem>
											)}

											{serviceType !== "compose" && (
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value="nfs"
																id="nfs"
																className="peer sr-only"
															/>
															<Label
																htmlFor="nfs"
																className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																NFS Mount
															</Label>
														</div>
													</FormControl>
												</FormItem>
											)}
											{serviceType !== "compose" && (
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value="smb"
																id="smb"
																className="peer sr-only"
															/>
															<Label
																htmlFor="smb"
																className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																SMB Mount
															</Label>
														</div>
													</FormControl>
												</FormItem>
											)}
											<FormItem
												className={cn(
													serviceType === "compose" && "col-span-3",
													"flex items-center space-x-3 space-y-0",
												)}
											>
												<FormControl className="w-full">
													<div>
														<RadioGroupItem
															value="file"
															id="file"
															className="peer sr-only"
														/>
														<Label
															htmlFor="file"
															className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
														>
															File Mount
														</Label>
													</div>
												</FormControl>
											</FormItem>
										</RadioGroup>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								Fill the next fields.
							</FormLabel>
							<div className="flex flex-col gap-2">
								{type === "bind" && (
									<FormField
										control={form.control}
										name="hostPath"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Host Path</FormLabel>
												<FormControl>
													<Input placeholder="Host Path" {...field} />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								)}
								{type === "volume" && (
									<FormField
										control={form.control}
										name="volumeName"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Volume Name</FormLabel>
												<FormControl>
													<Input
														placeholder="Volume Name"
														{...field}
														value={field.value || ""}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								{type === "file" && (
									<>
										<FormField
											control={form.control}
											name="content"
											render={({ field }) => (
												<FormItem className="max-w-full max-w-[45rem]">
													<FormLabel>Content</FormLabel>
													<FormControl>
														<FormControl>
															<CodeEditor
																language="properties"
																placeholder={`NODE_ENV=production
PORT=3000
`}
																className="h-96 font-mono "
																{...field}
															/>
														</FormControl>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="filePath"
											render={({ field }) => (
												<FormItem>
													<FormLabel>File Path</FormLabel>
													<FormControl>
														<FormControl>
															<Input
																placeholder="Name of the file"
																{...field}
															/>
														</FormControl>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}
								{(type === "nfs" || type === "smb") && (
									<>
										{type === "nfs" && (
											<>
												<FormField
													control={form.control}
													name="mountMethod"
													render={({ field }) => (
														<FormItem className="space-y-3">
															<FormLabel>Mount Method</FormLabel>
															<FormDescription>
																Choose how to mount the NFS share
															</FormDescription>
															<FormControl>
																<RadioGroup
																	onValueChange={field.onChange}
																	defaultValue={field.value || "host-mount"}
																	className="flex flex-col space-y-1"
																>
																	<FormItem className="flex items-center space-x-3 space-y-0">
																		<FormControl>
																			<RadioGroupItem
																				value="docker-volume"
																				id="docker-volume"
																			/>
																		</FormControl>
																		<FormLabel
																			htmlFor="docker-volume"
																			className="font-normal cursor-pointer"
																		>
																			<div className="flex flex-col">
																				<span className="font-medium">
																					Docker Native Volume
																				</span>
																				<span className="text-sm text-muted-foreground">
																					Simpler, Docker-managed lifecycle.
																					Recommended for most NFS mounts.
																				</span>
																			</div>
																		</FormLabel>
																	</FormItem>
																	<FormItem className="flex items-center space-x-3 space-y-0">
																		<FormControl>
																			<RadioGroupItem
																				value="host-mount"
																				id="host-mount"
																			/>
																		</FormControl>
																		<FormLabel
																			htmlFor="host-mount"
																			className="font-normal cursor-pointer"
																		>
																			<div className="flex flex-col">
																				<span className="font-medium">
																					Host-Level Mount
																				</span>
																				<span className="text-sm text-muted-foreground">
																					Full control, mount on host then bind
																					into container. Use for advanced
																					configurations.
																				</span>
																			</div>
																		</FormLabel>
																	</FormItem>
																</RadioGroup>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<Separator />
												<FormField
													control={form.control}
													name="nfsServer"
													render={({ field }) => (
														<FormItem>
															<FormLabel>NFS Server</FormLabel>
															<FormControl>
																<Input
																	placeholder="192.168.1.100 or nfs.example.com"
																	{...field}
																/>
															</FormControl>
															<FormDescription>
																IP address or hostname of the NFS server
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="nfsPath"
													render={({ field }) => (
														<FormItem>
															<FormLabel>NFS Export Path</FormLabel>
															<FormControl>
																<Input placeholder="/export/data" {...field} />
															</FormControl>
															<FormDescription>
																Path to the NFS export on the server
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
											</>
										)}
										{type === "smb" && (
											<>
												<FormField
													control={form.control}
													name="smbServer"
													render={({ field }) => (
														<FormItem>
															<FormLabel>SMB Server</FormLabel>
															<FormControl>
																<Input
																	placeholder="192.168.1.100 or smb.example.com"
																	{...field}
																/>
															</FormControl>
															<FormDescription>
																IP address or hostname of the SMB server
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="smbShare"
													render={({ field }) => (
														<FormItem>
															<FormLabel>SMB Share Name</FormLabel>
															<FormControl>
																<Input placeholder="sharename" {...field} />
															</FormControl>
															<FormDescription>
																Name of the SMB share
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="smbPath"
													render={({ field }) => (
														<FormItem>
															<FormLabel>SMB Subdirectory (Optional)</FormLabel>
															<FormControl>
																<Input placeholder="/subdirectory" {...field} />
															</FormControl>
															<FormDescription>
																Optional subdirectory within the share
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
											</>
										)}
										<FormField
											control={form.control}
											name="mountOptions"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Mount Options (Optional)</FormLabel>
													<FormControl>
														<Input
															placeholder="vers=4.0,soft,timeo=30"
															{...field}
														/>
													</FormControl>
													<FormDescription>
														Additional mount options (e.g., vers=4.0,soft)
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										{(type === "nfs" || type === "smb") && (
											<>
												<Separator />
												<FormField
													control={form.control}
													name="username"
													render={({ field }) => (
														<FormItem>
															<FormLabel>
																Username
																{type === "smb" ? " (Required)" : " (Optional)"}
															</FormLabel>
															<FormControl>
																<Input placeholder="username" {...field} />
															</FormControl>
															<FormDescription>
																{type === "smb"
																	? "Username for SMB authentication"
																	: "Username for NFS authentication (if required)"}
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="password"
													render={({ field }) => (
														<FormItem>
															<FormLabel>
																Password
																{type === "smb" ? " (Required)" : " (Optional)"}
															</FormLabel>
															<FormControl>
																<div className="relative">
																	<Input
																		type={showPassword ? "text" : "password"}
																		placeholder="password"
																		{...field}
																	/>
																	<Button
																		type="button"
																		variant="ghost"
																		size="sm"
																		className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
																		onClick={() =>
																			setShowPassword(!showPassword)
																		}
																	>
																		{showPassword ? (
																			<EyeOff className="h-4 w-4" />
																		) : (
																			<Eye className="h-4 w-4" />
																		)}
																	</Button>
																</div>
															</FormControl>
															<FormDescription>
																{type === "smb"
																	? "Password for SMB authentication"
																	: "Password for NFS authentication (if required)"}
															</FormDescription>
															<FormMessage />
														</FormItem>
													)}
												/>
												{type === "smb" && (
													<FormField
														control={form.control}
														name="domain"
														render={({ field }) => (
															<FormItem>
																<FormLabel>Domain (Optional)</FormLabel>
																<FormControl>
																	<Input placeholder="WORKGROUP" {...field} />
																</FormControl>
																<FormDescription>
																	Windows domain for SMB authentication
																</FormDescription>
																<FormMessage />
															</FormItem>
														)}
													/>
												)}
											</>
										)}
										<Separator />
										<FormField
											control={form.control}
											name="replicateToSwarm"
											render={({ field }) => (
												<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
													<div className="space-y-0.5">
														<FormLabel className="text-base">
															Replicate to Swarm Nodes
														</FormLabel>
														<FormDescription>
															{mountMethod === "docker-volume"
																? "Create Docker volume on selected Swarm nodes"
																: "Distribute this mount to selected Docker Swarm nodes"}
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
										{replicateToSwarm && (
											<FormField
												control={form.control}
												name="targetNodes"
												render={() => (
													<FormItem>
														<div className="mb-4">
															<FormLabel className="text-base">
																Select Swarm Nodes
															</FormLabel>
															<FormDescription>
																Choose which nodes should have this mount. At
																least one node must be selected.
															</FormDescription>
														</div>
														{nodesLoading ? (
															<div className="flex items-center justify-center p-8">
																<Loader2 className="h-6 w-6 animate-spin" />
															</div>
														) : availableNodes && availableNodes.length > 0 ? (
															<ScrollArea className="h-[300px] rounded-md border p-4">
																<div className="space-y-2">
																	{availableNodes.map((node) => (
																		<FormField
																			key={node.nodeId}
																			control={form.control}
																			name="targetNodes"
																			render={({ field }) => {
																				return (
																					<FormItem
																						key={node.nodeId}
																						className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"
																					>
																						<FormControl>
																							<Checkbox
																								checked={field.value?.includes(
																									node.nodeId,
																								)}
																								onCheckedChange={(checked) => {
																									return checked
																										? field.onChange([
																												...(field.value || []),
																												node.nodeId,
																											])
																										: field.onChange(
																												field.value?.filter(
																													(value) =>
																														value !==
																														node.nodeId,
																												) || [],
																											);
																								}}
																							/>
																						</FormControl>
																						<div className="space-y-1 leading-none flex-1">
																							<FormLabel className="flex items-center gap-2">
																								{node.hostname}
																								<Badge variant="outline">
																									{node.role}
																								</Badge>
																								{node.availability ===
																									"active" && (
																									<Badge variant="green">
																										Active
																									</Badge>
																								)}
																							</FormLabel>
																							<FormDescription className="text-xs">
																								{node.ip} • {node.status}
																								{node.labels &&
																									Object.keys(node.labels)
																										.length > 0 && (
																										<span>
																											{" "}
																											•{" "}
																											{Object.entries(
																												node.labels,
																											)
																												.map(
																													([key, value]) =>
																														`${key}=${value}`,
																												)
																												.join(", ")}
																										</span>
																									)}
																							</FormDescription>
																						</div>
																					</FormItem>
																				);
																			}}
																		/>
																	))}
																</div>
															</ScrollArea>
														) : (
															<AlertBlock>
																<p>
																	No swarm nodes available. Make sure Docker
																	Swarm is initialized and nodes are accessible.
																</p>
															</AlertBlock>
														)}
														<FormMessage />
													</FormItem>
												)}
											/>
										)}
									</>
								)}
								{serviceType !== "compose" && (
									<FormField
										control={form.control}
										name="mountPath"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Mount Path (In the container)</FormLabel>
												<FormControl>
													<Input placeholder="Mount Path" {...field} />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form-volume"
							type="submit"
						>
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
