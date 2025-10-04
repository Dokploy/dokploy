import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

const isNonEmptyString = (s: unknown): boolean => {
	if (!s) return false;
	if (typeof s !== "string") return false;
	if (s.trim() === "") return false;
	if (s.trim().length < 1) return false;
	return true;
};

const AddRegistrySchema = z
	.object({
		registryName: z.string().min(1, {
			message: "Registry name is required",
		}),
		registryType: z.enum(["cloud", "awsEcr"], {
			message: "Registry type is required",
		}),
		username: z.string().optional(),
		password: z.string().optional(),
		registryUrl: z.string(),
		imagePrefix: z.string(),
		serverId: z.string().optional(),
		// AWS ECR specific fields
		awsAccessKeyId: z.string().optional(),
		awsSecretAccessKey: z.string().optional(),
		awsRegion: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		const { awsAccessKeyId, awsSecretAccessKey, awsRegion, registryUrl } = data;
		if (data.registryType === "awsEcr") {
			if (!isNonEmptyString(awsAccessKeyId)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "AWS Access Key ID is required",
					path: ["awsAccessKeyId"],
				});
			}
			if (!isNonEmptyString(awsSecretAccessKey)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "AWS Secret Access Key is required",
					path: ["awsSecretAccessKey"],
				});
			}
			if (!isNonEmptyString(awsRegion)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "AWS Region is required",
					path: ["awsRegion"],
				});
			}
			if (!isNonEmptyString(registryUrl)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Registry URL is required",
					path: ["registryUrl"],
				});
			}
		} else {
			// For regular registries, require username and password
			if (!isNonEmptyString(data.username)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Username is required",
					path: ["username"],
				});
			}
			if (!isNonEmptyString(data.password)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Password is required",
					path: ["password"],
				});
			}
		}
	});

type AddRegistry = z.infer<typeof AddRegistrySchema>;

interface Props {
	registryId?: string;
}

export const HandleRegistry = ({ registryId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { data: registry } = api.registry.one.useQuery(
		{
			registryId: registryId || "",
		},
		{
			enabled: !!registryId,
		},
	);

	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { mutateAsync, error, isError } = registryId
		? api.registry.update.useMutation()
		: api.registry.create.useMutation();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const {
		mutateAsync: testRegistry,
		isLoading,
		error: testRegistryError,
		isError: testRegistryIsError,
	} = api.registry.testRegistry.useMutation();
	const form = useForm<AddRegistry>({
		defaultValues: {
			registryType: "cloud",
			username: "",
			password: "",
			registryUrl: "",
			imagePrefix: "",
			registryName: "",
			serverId: "",
			awsAccessKeyId: "",
			awsSecretAccessKey: "",
			awsRegion: "",
		},
		resolver: zodResolver(AddRegistrySchema),
	});

	const password = form.watch("password");
	const username = form.watch("username");
	const registryUrl = form.watch("registryUrl");
	const registryName = form.watch("registryName");
	const imagePrefix = form.watch("imagePrefix");
	const serverId = form.watch("serverId");
	const registryType = form.watch("registryType");
	const awsAccessKeyId = form.watch("awsAccessKeyId");
	const awsSecretAccessKey = form.watch("awsSecretAccessKey");
	const awsRegion = form.watch("awsRegion");

	useEffect(() => {
		if (registry) {
			form.reset({
				registryType:
					registry.registryType === "selfHosted"
						? "cloud"
						: registry.registryType,
				username: registry.username || "",
				password: "",
				registryUrl: registry.registryUrl,
				imagePrefix: registry.imagePrefix || "",
				registryName: registry.registryName,
				awsAccessKeyId: registry.awsAccessKeyId || "",
				awsSecretAccessKey: "",
				awsRegion: registry.awsRegion || "",
			});
		} else {
			form.reset({
				registryType: "cloud",
				username: "",
				password: "",
				registryUrl: "",
				imagePrefix: "",
				serverId: "",
				awsAccessKeyId: "",
				awsSecretAccessKey: "",
				awsRegion: "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, registry]);

	const onSubmit = async (data: AddRegistry) => {
		await mutateAsync({
			password: data.password || "",
			registryName: data.registryName,
			username: data.username || "",
			registryUrl: data.registryUrl,
			registryType: data.registryType,
			imagePrefix: data.imagePrefix,
			serverId: data.serverId,
			registryId: registryId || "",
			awsAccessKeyId: data.awsAccessKeyId || "",
			awsSecretAccessKey: data.awsSecretAccessKey || "",
			awsRegion: data.awsRegion || "",
		})
			.then(async (_data) => {
				await utils.registry.all.invalidate();
				toast.success(registryId ? "Registry updated" : "Registry added");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					registryId ? "Error updating a registry" : "Error adding a registry",
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{registryId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add Registry
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add a external registry</DialogTitle>
					<DialogDescription>
						Fill the next fields to add a external registry.
					</DialogDescription>
				</DialogHeader>
				{(isError || testRegistryIsError) && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{testRegistryError?.message || error?.message || ""}
						</span>
					</div>
				)}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="registryName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Registry Name</FormLabel>
										<FormControl>
											<Input placeholder="Registry Name" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="registryType"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Registry Type</FormLabel>
										<FormControl>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select registry type" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectLabel>Registry Types</SelectLabel>
														<SelectItem value="cloud">
															Generic Registry
														</SelectItem>
														<SelectItem value="awsEcr">AWS ECR</SelectItem>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						{registryType === "cloud" && (
							<div className="flex flex-col gap-4">
								<FormField
									control={form.control}
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input
													placeholder="Username"
													autoComplete="username"
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						)}
						{registryType === "cloud" && (
							<div className="flex flex-col gap-4">
								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Password</FormLabel>
											<FormControl>
												<Input
													placeholder="Password"
													autoComplete="one-time-code"
													{...field}
													type="password"
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						)}
						{registryType === "awsEcr" && (
							<>
								<div className="flex flex-col gap-4">
									<FormField
										control={form.control}
										name="awsAccessKeyId"
										render={({ field }) => (
											<FormItem>
												<FormLabel>AWS Access Key ID</FormLabel>
												<FormControl>
													<Input
														placeholder="AKIAIOSFODNN7EXAMPLE"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<div className="flex flex-col gap-4">
									<FormField
										control={form.control}
										name="awsSecretAccessKey"
										render={({ field }) => (
											<FormItem>
												<FormLabel>AWS Secret Access Key</FormLabel>
												<FormControl>
													<Input
														placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
														type="password"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<div className="flex flex-col gap-4">
									<FormField
										control={form.control}
										name="awsRegion"
										render={({ field }) => (
											<FormItem>
												<FormLabel>AWS Region</FormLabel>
												<FormControl>
													<Input placeholder="us-east-1" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</>
						)}
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="imagePrefix"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Image Prefix</FormLabel>
										<FormControl>
											<Input {...field} placeholder="Image Prefix" />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-col gap-4  col-span-2">
							<FormField
								control={form.control}
								name="registryUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Registry URL</FormLabel>
										<FormControl>
											<Input
												placeholder={
													registryType === "awsEcr"
														? "123456789012.dkr.ecr.us-east-1.amazonaws.com"
														: "registry.example.com"
												}
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="col-span-2">
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Server {!isCloud && "(Optional)"}</FormLabel>
										<FormDescription>
											Select a server to test the registry. this will run the
											following command on the server
										</FormDescription>
										<FormControl>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select a server" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectLabel>Servers</SelectLabel>
														{servers?.map((server) => (
															<SelectItem
																key={server.serverId}
																value={server.serverId}
															>
																{server.name}
															</SelectItem>
														))}
														<SelectItem value={"none"}>None</SelectItem>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<DialogFooter className="flex flex-col w-full sm:justify-between gap-4 flex-wrap sm:flex-col col-span-2">
							<div className="flex flex-row gap-2 justify-between">
								<Button
									type="button"
									variant={"secondary"}
									isLoading={isLoading}
									onClick={async () => {
										const validationResult = AddRegistrySchema.safeParse({
											registryType,
											username,
											password,
											registryUrl,
											registryName: "Dokploy Registry",
											imagePrefix,
											serverId,
											awsAccessKeyId,
											awsSecretAccessKey,
											awsRegion,
										});

										if (!validationResult.success) {
											for (const issue of validationResult.error.issues) {
												form.setError(issue.path[0] as any, {
													type: "manual",
													message: issue.message,
												});
											}
											return;
										}

										await testRegistry({
											username: username || "",
											password: password || "",
											registryUrl: registryUrl,
											registryName: registryName,
											registryType: registryType,
											imagePrefix: imagePrefix,
											serverId: serverId,
											awsAccessKeyId: awsAccessKeyId,
											awsSecretAccessKey: awsSecretAccessKey,
											awsRegion: awsRegion,
										})
											.then((data) => {
												if (data) {
													toast.success("Registry Tested Successfully");
												} else {
													toast.error("Registry Test Failed");
												}
											})
											.catch(() => {
												toast.error("Error testing the registry");
											});
									}}
								>
									Test Registry
								</Button>
								<Button isLoading={form.formState.isSubmitting} type="submit">
									{registryId ? "Update" : "Create"}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
