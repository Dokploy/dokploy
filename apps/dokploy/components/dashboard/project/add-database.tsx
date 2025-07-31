import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Database, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { slugify } from "@/lib/slug";
import { api } from "@/utils/api";

type DbType = typeof mySchema._type.type;

const dockerImageDefaultPlaceholder: Record<DbType, string> = {
	mongo: "mongo:6",
	mariadb: "mariadb:11",
	mysql: "mysql:8",
	postgres: "postgres:15",
	redis: "redis:7",
};

const databasesUserDefaultPlaceholder: Record<
	Exclude<DbType, "redis">,
	string
> = {
	mongo: "mongo",
	mariadb: "mariadb",
	mysql: "mysql",
	postgres: "postgres",
};

const baseDatabaseSchema = z.object({
	name: z.string().min(1, "Name required"),
	appName: z
		.string()
		.min(1, {
			message: "App name is required",
		})
		.regex(/^[a-z](?!.*--)([a-z0-9-]*[a-z])?$/, {
			message:
				"App name supports lowercase letters, numbers, '-' and can only start and end letters, and does not support continuous '-'",
		}),
	databasePassword: z.string(),
	dockerImage: z.string(),
	description: z.string().nullable(),
	serverId: z.string().nullable(),
});

const mySchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("postgres"),
			databaseName: z.string().default("postgres"),
			databaseUser: z.string().default("postgres"),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("mongo"),
			databaseUser: z.string().default("mongo"),
			replicaSets: z.boolean().default(false),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("redis"),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("mysql"),
			databaseRootPassword: z.string().default(""),
			databaseUser: z.string().default("mysql"),
			databaseName: z.string().default("mysql"),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("mariadb"),
			dockerImage: z.string().default("mariadb:4"),
			databaseRootPassword: z.string().default(""),
			databaseUser: z.string().default("mariadb"),
			databaseName: z.string().default("mariadb"),
		})
		.merge(baseDatabaseSchema),
]);

const databasesMap = {
	postgres: {
		icon: <PostgresqlIcon />,
		label: "PostgreSQL",
	},
	mongo: {
		icon: <MongodbIcon />,
		label: "MongoDB",
	},
	mariadb: {
		icon: <MariadbIcon />,
		label: "MariaDB",
	},
	mysql: {
		icon: <MysqlIcon />,
		label: "MySQL",
	},
	redis: {
		icon: <RedisIcon />,
		label: "Redis",
	},
};

type AddDatabase = z.infer<typeof mySchema>;

interface Props {
	projectId: string;
	projectName?: string;
}

export const AddDatabase = ({ projectId, projectName }: Props) => {
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);
	const slug = slugify(projectName);
	const { data: servers } = api.server.withSSHKey.useQuery();
	const postgresMutation = api.postgres.create.useMutation();
	const mongoMutation = api.mongo.create.useMutation();
	const redisMutation = api.redis.create.useMutation();
	const mariadbMutation = api.mariadb.create.useMutation();
	const mysqlMutation = api.mysql.create.useMutation();

	const hasServers = servers && servers.length > 0;

	const form = useForm<AddDatabase>({
		defaultValues: {
			type: "postgres",
			dockerImage: "",
			name: "",
			appName: `${slug}-`,
			databasePassword: "",
			description: "",
			databaseName: "",
			databaseUser: "",
			serverId: null,
		},
		resolver: zodResolver(mySchema),
	});
	const type = form.watch("type");
	const activeMutation = {
		postgres: postgresMutation,
		mongo: mongoMutation,
		redis: redisMutation,
		mariadb: mariadbMutation,
		mysql: mysqlMutation,
	};

	const onSubmit = async (data: AddDatabase) => {
		const defaultDockerImage =
			data.dockerImage || dockerImageDefaultPlaceholder[data.type];

		let promise: Promise<unknown> | null = null;
		const commonParams = {
			name: data.name,
			appName: data.appName,
			dockerImage: defaultDockerImage,
			projectId,
			serverId: data.serverId,
			description: data.description,
		};

		if (data.type === "postgres") {
			promise = postgresMutation.mutateAsync({
				...commonParams,
				databasePassword: data.databasePassword,
				databaseName: data.databaseName || "postgres",

				databaseUser:
					data.databaseUser || databasesUserDefaultPlaceholder[data.type],
				serverId: data.serverId,
			});
		} else if (data.type === "mongo") {
			promise = mongoMutation.mutateAsync({
				...commonParams,
				databasePassword: data.databasePassword,
				databaseUser:
					data.databaseUser || databasesUserDefaultPlaceholder[data.type],
				serverId: data.serverId,
				replicaSets: data.replicaSets,
			});
		} else if (data.type === "redis") {
			promise = redisMutation.mutateAsync({
				...commonParams,
				databasePassword: data.databasePassword,
				serverId: data.serverId,
				projectId,
			});
		} else if (data.type === "mariadb") {
			promise = mariadbMutation.mutateAsync({
				...commonParams,
				databasePassword: data.databasePassword,
				databaseRootPassword: data.databaseRootPassword,
				databaseName: data.databaseName || "mariadb",
				databaseUser:
					data.databaseUser || databasesUserDefaultPlaceholder[data.type],
				serverId: data.serverId,
			});
		} else if (data.type === "mysql") {
			promise = mysqlMutation.mutateAsync({
				...commonParams,
				databasePassword: data.databasePassword,
				databaseName: data.databaseName || "mysql",
				databaseUser:
					data.databaseUser || databasesUserDefaultPlaceholder[data.type],
				databaseRootPassword: data.databaseRootPassword,
				serverId: data.serverId,
			});
		}

		if (promise) {
			await promise
				.then(async () => {
					toast.success("Database Created");
					form.reset({
						type: "postgres",
						dockerImage: "",
						name: "",
						appName: `${projectName}-`,
						databasePassword: "",
						description: "",
						databaseName: "",
						databaseUser: "",
					});
					setVisible(false);
					await utils.project.one.invalidate({
						projectId,
					});
				})
				.catch(() => {
					toast.error("Error creating a database");
				});
		}
	};
	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Database className="size-4 text-muted-foreground" />
					<span>Database</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="md:max-h-[90vh]  sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Databases</DialogTitle>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<FormField
							control={form.control}
							defaultValue={form.control._defaultValues.type}
							name="type"
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel className="text-muted-foreground">
										Select a database
									</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											defaultValue={field.value}
											className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
										>
											{Object.entries(databasesMap).map(([key, value]) => (
												<FormItem
													key={key}
													className="flex w-full items-center space-x-3 space-y-0"
												>
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value={key}
																id={key}
																className="peer sr-only"
															/>
															<Label
																htmlFor={key}
																className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																{value.icon}
																{value.label}
															</Label>
														</div>
													</FormControl>
												</FormItem>
											))}
										</RadioGroup>
									</FormControl>
									<FormMessage />
									{activeMutation[field.value].isError && (
										<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
											<AlertTriangle className="text-red-600 dark:text-red-400" />
											<span className="text-sm text-red-600 dark:text-red-400">
												{activeMutation[field.value].error?.message}
											</span>
										</div>
									)}
								</FormItem>
							)}
						/>
						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								Fill the next fields.
							</FormLabel>
							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input
													placeholder="Name"
													{...field}
													onChange={(e) => {
														const val = e.target.value?.trim() || "";
														const serviceName = slugify(val);
														form.setValue("appName", `${slug}-${serviceName}`);
														field.onChange(val);
													}}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								{hasServers && (
									<FormField
										control={form.control}
										name="serverId"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Select a Server</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<SelectTrigger>
														<SelectValue placeholder="Select a Server" />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{servers?.map((server) => (
																<SelectItem
																	key={server.serverId}
																	value={server.serverId}
																>
																	{server.name}
																</SelectItem>
															))}
															<SelectLabel>
																Servers ({servers?.length})
															</SelectLabel>
														</SelectGroup>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
								<FormField
									control={form.control}
									name="appName"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="flex items-center gap-2">
												App Name
												<TooltipProvider delayDuration={0}>
													<Tooltip>
														<TooltipTrigger asChild>
															<HelpCircle className="size-4 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent side="right">
															<p>
																This will be the name of the Docker Swarm
																service
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</FormLabel>
											<FormControl>
												<Input placeholder="my-app" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Description</FormLabel>
											<FormControl>
												<Textarea
													className="h-24"
													placeholder="Description"
													{...field}
													value={field.value || ""}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								{(type === "mysql" ||
									type === "mariadb" ||
									type === "postgres") && (
									<FormField
										control={form.control}
										name="databaseName"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Database Name</FormLabel>
												<FormControl>
													<Input placeholder="Database Name" {...field} />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								)}
								{(type === "mysql" ||
									type === "mariadb" ||
									type === "postgres" ||
									type === "mongo") && (
									<FormField
										control={form.control}
										name="databaseUser"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Database User</FormLabel>
												<FormControl>
													<Input
														placeholder={`Default ${databasesUserDefaultPlaceholder[type]}`}
														autoComplete="off"
														{...field}
													/>
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								<FormField
									control={form.control}
									name="databasePassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Database Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="******************"
													autoComplete="one-time-code"
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								{(type === "mysql" || type === "mariadb") && (
									<FormField
										control={form.control}
										name="databaseRootPassword"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Database Root password</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder="******************"
														{...field}
													/>
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								<FormField
									control={form.control}
									name="dockerImage"
									defaultValue={form.formState.defaultValues?.dockerImage}
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Docker image</FormLabel>
												<FormControl>
													<Input
														placeholder={`Default ${dockerImageDefaultPlaceholder[type]}`}
														{...field}
													/>
												</FormControl>

												<FormMessage />
											</FormItem>
										);
									}}
								/>

								{type === "mongo" && (
									<FormField
										control={form.control}
										name="replicaSets"
										render={({ field }) => {
											return (
												<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
													<div className="space-y-0.5">
														<FormLabel>Use Replica Sets</FormLabel>
													</div>
													<FormControl>
														<Switch
															checked={field.value}
															onCheckedChange={field.onChange}
														/>
													</FormControl>

													<FormMessage />
												</FormItem>
											);
										}}
									/>
								)}
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form"
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
