import { Button } from "@/components/ui/button";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import {
	type CloudStorageDestinationFormValues,
	cloudStorageDestinationSchema,
} from "@dokploy/server/db/schema/cloud-storage-destination";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Check,
	CheckCircle2,
	Copy,
	Eye,
	EyeOff,
	Loader2,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CLOUD_STORAGE_PROVIDERS } from "./constants";

export const CLOUD_STORAGE_PROVIDER_TYPES = CLOUD_STORAGE_PROVIDERS.map(
	(p) => p.key as string,
);

export function isCloudStorageProvider(provider: string): boolean {
	return CLOUD_STORAGE_PROVIDER_TYPES.includes(provider);
}

interface Props {
	destinationId?: string;
	inTabContent?: boolean;
	commonName?: string;
}

type CloudStorageProviderType = "drive" | "dropbox" | "box" | "ftp" | "sftp";

export const CloudStorageDestinations = ({
	destinationId,
	inTabContent = false,
	commonName,
}: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const [connectionTested, setConnectionTested] = useState(false);

	const { mutateAsync: createMutation, isLoading: isCreating } =
		api.cloudStorageDestination.create.useMutation();
	const { mutateAsync: updateMutation, isLoading: isUpdating } =
		api.cloudStorageDestination.update.useMutation();
	const { mutateAsync: testConnection, isLoading: isLoadingConnection } =
		api.cloudStorageDestination.testConnection.useMutation();

	const isLoading = isCreating || isUpdating;

	const { data: destinations } = api.cloudStorageDestination.all.useQuery();
	const destination = destinationId
		? destinations?.find((d) => d.id === destinationId)
		: undefined;

	const form = useForm<CloudStorageDestinationFormValues>({
		defaultValues: {
			providerType: undefined,
			host: "",
			username: "",
			password: "",
			port: "",
			token: "",
		},
		resolver: zodResolver(cloudStorageDestinationSchema),
		mode: "onSubmit",
	});

	const providerType = form.watch("providerType") as CloudStorageProviderType;

	useEffect(() => {
		setConnectionTested(false);
		form.setValue("token", "");
		form.setValue("host", "");
		form.setValue("username", "");
		form.setValue("password", "");
		form.setValue("port", "");
	}, [providerType, form]);

	useEffect(() => {
		if (!open) {
			form.reset();
			setConnectionTested(false);
		}
	}, [open, form]);

	useEffect(() => {
		if (destination) {
			form.reset({
				providerType: destination.provider as any,
				host: destination.host || "",
				username: destination.username || "",
				password: destination.password || "",
				port: destination.port || "",
				token: destination.config || "",
			});
		} else {
			form.reset({
				providerType: undefined,
				host: "",
				username: "",
				password: "",
				port: "",
				token: "",
			});
		}
	}, [form, destination]);

	// Handle form submission
	const onSubmit = async (data: CloudStorageDestinationFormValues) => {
		try {
			if (!connectionTested && !destinationId) {
				toast.error("Please test the connection first");
				return;
			}

			const credentials = {
				...(data.providerType === "ftp" || data.providerType === "sftp"
					? {
							host: data.host,
							username: data.username,
							password: data.password,
							port: data.port,
						}
					: {}),
				...(["drive", "dropbox", "box"].includes(data.providerType)
					? {
							token: data.token,
						}
					: {}),
			};

			if (destinationId) {
				await updateMutation({
					destinationId,
					name: commonName || data.providerType,
					provider: data.providerType,
					config: JSON.stringify(credentials),
				});
				toast.success("Destination updated");
			} else {
				await createMutation({
					name: commonName || data.providerType,
					provider: data.providerType,
					config: JSON.stringify(credentials),
				});
				toast.success("Destination created");
			}

			await utils.cloudStorageDestination.all.invalidate();
			form.reset();
			setConnectionTested(false);
			setOpen(false);
		} catch (err: any) {
			toast.error("Error saving destination", {
				description: err.message,
			});
		}
	};

	// Handle test connection
	const handleTestConnection = async () => {
		const data = form.getValues();

		try {
			// For FTP/SFTP, ensure password is base64 encoded
			if (
				(data.providerType === "ftp" || data.providerType === "sftp") &&
				data.password
			) {
				try {
					const cleanPassword = data.password.trim();

					if (!cleanPassword || cleanPassword.includes(" ")) {
						throw new Error("Invalid password format");
					}

					form.setValue("password", cleanPassword);
				} catch (_e) {
					toast.error("Invalid password format", {
						description:
							"Please make sure you copied the entire output from 'rclone obscure' command without any extra spaces.",
					});
					return;
				}
			}

			const result = await testConnection({
				provider: data.providerType,
				credentials: {
					host: data.host,
					username: data.username,
					password: data.password,
					port: data.port,
					token: data.token,
				},
			});

			// Store the token if it exists
			if (result.token) {
				form.setValue("token", result.token);
				const providerName = (() => {
					switch (data.providerType as CloudStorageProviderType) {
						case "drive":
							return "Google Drive";
						case "dropbox":
							return "Dropbox";
						case "box":
							return "Box";
						case "ftp":
							return "FTP";
						case "sftp":
							return "SFTP";
						default:
							return data.providerType;
					}
				})();
				toast.success(`${providerName} authentication successful`, {
					description: "Your account has been connected successfully.",
				});
			}

			setConnectionTested(true);
			if (!result.token) {
				toast.success("Connection test successful");
			}
		} catch (_err: any) {
			setConnectionTested(false);
			form.setValue("token", "");
			toast.error("Connection test failed", {
				description: "Connection failed, please try again.",
			});
		}
	};

	// Render provider-specific fields
	const renderProviderFields = () => {
		if (!providerType) return null;

		switch (providerType) {
			case "ftp":
			case "sftp":
				return (
					<>
						<FormField
							control={form.control}
							name="host"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Host</FormLabel>
									<FormControl>
										<Input placeholder="ftp.example.com" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="username"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Username</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Password</FormLabel>
									<FormControl>
										<Input
											type="password"
											{...field}
											placeholder="Enter base64 encoded password"
										/>
									</FormControl>
									<FormMessage />
									<div className="text-xs text-muted-foreground mt-2 space-y-1">
										<p>To get the base64 encoded password:</p>
										<ol className="list-decimal list-inside space-y-1">
											<li>
												Open terminal and run:{" "}
												<code className="px-1 py-0.5 bg-muted rounded">
													rclone obscure your_password
												</code>
											</li>
											<li>Copy the output and paste it here</li>
										</ol>
										<p className="text-yellow-600 dark:text-yellow-500 mt-1">
											Note: Do not enter your plain password. It must be base64
											encoded using rclone obscure.
										</p>
									</div>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="port"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Port (Optional)</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder={providerType === "ftp" ? "21" : "22"}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</>
				);

			case "drive":
			case "dropbox":
			case "box":
				return (
					<FormField
						control={form.control}
						name="token"
						render={({ field: { value } }) => {
							const [copied, setCopied] = useState(false);
							const [showToken, setShowToken] = useState(false);

							const handleCopy = async (text: string) => {
								await navigator.clipboard.writeText(text);
								setCopied(true);
								setTimeout(() => setCopied(false), 2000);
							};

							const providerName = (() => {
								switch (providerType as CloudStorageProviderType) {
									case "drive":
										return "Google Drive";
									case "dropbox":
										return "Dropbox";
									case "box":
										return "Box";
									case "ftp":
										return "FTP";
									case "sftp":
										return "SFTP";
									default:
										return providerType;
								}
							})();

							return (
								<FormItem>
									<FormLabel>{providerName}</FormLabel>
									<FormControl>
										<div className="flex flex-col gap-3 p-4 border rounded-lg">
											<div className="flex items-center gap-2">
												{value ? (
													<>
														<CheckCircle2 className="h-5 w-5 text-green-500" />
														<span className="text-sm font-medium">
															Authentication Successful
														</span>
													</>
												) : (
													<>
														<XCircle className="h-5 w-5 text-muted-foreground" />
														<span className="text-sm font-medium text-muted-foreground">
															Not Authenticated
														</span>
													</>
												)}
											</div>

											{value && (
												<div className="mt-2 space-y-2">
													<div className="flex items-center justify-between">
														<div className="text-xs font-medium text-muted-foreground">
															OAuth Token:
														</div>
														<div className="flex items-center gap-2">
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-8 px-2"
																onClick={() => setShowToken(!showToken)}
															>
																{showToken ? (
																	<EyeOff className="h-4 w-4" />
																) : (
																	<Eye className="h-4 w-4" />
																)}
																<span className="ml-2 text-xs">
																	{showToken ? "Hide Token" : "Show Token"}
																</span>
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-8 px-2"
																onClick={() => handleCopy(value)}
															>
																{copied ? (
																	<Check className="h-4 w-4 text-green-500" />
																) : (
																	<Copy className="h-4 w-4" />
																)}
																<span className="ml-2 text-xs">
																	{copied ? "Copied!" : "Copy Token"}
																</span>
															</Button>
														</div>
													</div>
													{showToken && (
														<div className="p-3 bg-muted rounded-md">
															<code className="font-mono text-xs break-all whitespace-pre-wrap">
																{JSON.stringify(JSON.parse(value), null, 2)}
															</code>
														</div>
													)}
												</div>
											)}

											<div className="text-xs text-muted-foreground">
												{value
													? "Token obtained successfully. You can now create the destination."
													: `Click 'Test Connection' to start the OAuth flow with ${providerName}`}
											</div>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							);
						}}
					/>
				);
		}
	};

	// Render the form content
	const formContent = (
		<>
			<Form {...form}>
				<form
					id="cloud-storage-form"
					onSubmit={form.handleSubmit(onSubmit)}
					className="grid w-full gap-4"
				>
					<FormField
						control={form.control}
						name="providerType"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Provider Type</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select a storage provider" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{CLOUD_STORAGE_PROVIDERS.map((provider) => (
											<SelectItem key={provider.key} value={provider.key}>
												{provider.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					{renderProviderFields()}

					<DialogFooter className="flex flex-col sm:flex-row sm:justify-between items-center gap-4 mt-2">
						<Button
							type="button"
							variant="secondary"
							disabled={!providerType || isLoadingConnection}
							onClick={handleTestConnection}
							className="w-full sm:w-auto"
						>
							{isLoadingConnection ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Testing...
								</>
							) : (
								"Test Connection"
							)}
						</Button>

						<Button
							type="submit"
							isLoading={isLoading}
							className="w-full sm:w-auto order-first sm:order-last"
						>
							{destinationId ? "Update" : "Create"} Destination
						</Button>
					</DialogFooter>
				</form>
			</Form>
		</>
	);

	if (inTabContent) {
		return formContent;
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				<Button variant="outline">Add Cloud Storage</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{destinationId ? "Update" : "Add"} Cloud Storage Destination
					</DialogTitle>
					<DialogDescription>
						Configure cloud storage providers like Google Drive, FTP, or SFTP.
					</DialogDescription>
				</DialogHeader>
				{formContent}
			</DialogContent>
		</Dialog>
	);
};
