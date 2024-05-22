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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Database } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

type DbType = typeof mySchema._type.type;

// TODO: Change to a real docker images
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
	databasePassword: z.string(),
	dockerImage: z.string(),
	description: z.string().nullable(),
});

const mySchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("postgres"),
			databaseName: z.string().min(1, "Database name required"),
			databaseUser: z.string().default("postgres"),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("mongo"),
			databaseUser: z.string().default("mongo"),
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
			databaseName: z.string().min(1, "Database name required"),
		})
		.merge(baseDatabaseSchema),
	z
		.object({
			type: z.literal("mariadb"),
			dockerImage: z.string().default("mariadb:4"),
			databaseRootPassword: z.string().default(""),
			databaseUser: z.string().default("mariadb"),
			databaseName: z.string().min(1, "Database name required"),
		})
		.merge(baseDatabaseSchema),
]);

type AddDatabase = z.infer<typeof mySchema>;

interface Props {
	projectId: string;
}

export const AddDatabase = ({ projectId }: Props) => {
	const utils = api.useUtils();

	const { mutateAsync: createPostgresql } = api.postgres.create.useMutation();

	const { mutateAsync: createMongo } = api.mongo.create.useMutation();

	const { mutateAsync: createRedis } = api.redis.create.useMutation();

	const { mutateAsync: createMariadb } = api.mariadb.create.useMutation();

	const { mutateAsync: createMysql } = api.mysql.create.useMutation();

	const form = useForm<AddDatabase>({
		defaultValues: {
			type: "postgres",
			dockerImage: "",
			name: "",
			databasePassword: "",
			description: "",
			databaseName: "",
			databaseUser: "",
		},
		resolver: zodResolver(mySchema),
	});
	const type = form.watch("type");

	useEffect(() => {
		form.reset({
			type: "postgres",
			dockerImage: "",
			name: "",
			databasePassword: "",
			description: "",
			databaseName: "",
			databaseUser: "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddDatabase) => {
		const defaultDockerImage =
			data.dockerImage || dockerImageDefaultPlaceholder[data.type];

		let promise: Promise<unknown> | null = null;
		if (data.type === "postgres") {
			promise = createPostgresql({
				name: data.name,
				dockerImage: defaultDockerImage,
				databasePassword: data.databasePassword,
				databaseName: data.databaseName,
				databaseUser:
					data.databaseUser || databasesUserDefaultPlaceholder[data.type],
				projectId,
				description: data.description,
			});
		} else if (data.type === "mongo") {
			promise = createMongo({
				name: data.name,
				dockerImage: defaultDockerImage,
				databasePassword: data.databasePassword,
				databaseUser:
					data.databaseUser || databasesUserDefaultPlaceholder[data.type],
				projectId,
				description: data.description,
			});
		} else if (data.type === "redis") {
			promise = createRedis({
				name: data.name,
				dockerImage: defaultDockerImage,
				databasePassword: data.databasePassword,
				projectId,
				description: data.description,
			});
		} else if (data.type === "mariadb") {
			promise = createMariadb({
				name: data.name,
				dockerImage: defaultDockerImage,
				databasePassword: data.databasePassword,
				projectId,
				databaseRootPassword: data.databaseRootPassword,
				databaseName: data.databaseName,
				databaseUser:
					data.databaseUser || databasesUserDefaultPlaceholder[data.type],
				description: data.description,
			});
		} else if (data.type === "mysql") {
			promise = createMysql({
				name: data.name,
				dockerImage: defaultDockerImage,
				databasePassword: data.databasePassword,
				databaseName: data.databaseName,
				databaseUser:
					data.databaseUser || databasesUserDefaultPlaceholder[data.type],
				projectId,
				databaseRootPassword: data.databaseRootPassword,
				description: data.description,
			});
		}

		if (promise) {
			await promise
				.then(async () => {
					toast.success("Database Created");
					await utils.project.one.invalidate({
						projectId,
					});
				})
				.catch(() => {
					toast.error("Error to create a database");
				});
		}
	};
	return (
		<Dialog>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Database className="size-4 text-muted-foreground" />
					<span>Database</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Databases</DialogTitle>
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
											<FormItem className="flex w-full items-center space-x-3 space-y-0">
												<FormControl className="w-full">
													<div>
														<RadioGroupItem
															value="postgres"
															id="postgres"
															className="peer sr-only"
														/>
														<Label
															htmlFor="postgres"
															className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
														>
															<PostgresqlIcon />
															Postgresql
														</Label>
													</div>
												</FormControl>
											</FormItem>
											<FormItem className="flex items-center space-x-3 space-y-0">
												<FormControl className="w-full">
													<div>
														<RadioGroupItem
															value="mysql"
															id="mysql"
															className="peer sr-only"
														/>
														<Label
															htmlFor="mysql"
															className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
														>
															<MysqlIcon />
															Mysql
														</Label>
													</div>
												</FormControl>
											</FormItem>
											<FormItem className="flex items-center space-x-3 space-y-0">
												<FormControl className="w-full">
													<div>
														<RadioGroupItem
															value="mariadb"
															id="mariadb"
															className="peer sr-only"
														/>
														<Label
															htmlFor="mariadb"
															className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
														>
															<MariadbIcon />
															Mariadb
														</Label>
													</div>
												</FormControl>
											</FormItem>
											<FormItem className="flex items-center space-x-3 space-y-0">
												<FormControl className="w-full">
													<div>
														<RadioGroupItem
															value="mongo"
															id="mongo"
															className="peer sr-only"
														/>
														<Label
															htmlFor="mongo"
															className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
														>
															<MongodbIcon />
															Mongo
														</Label>
													</div>
												</FormControl>
											</FormItem>
											<FormItem className="flex items-center space-x-3 space-y-0">
												<FormControl className="w-full">
													<div>
														<RadioGroupItem
															value="redis"
															id="redis"
															className="peer sr-only"
														/>
														<Label
															htmlFor="redis"
															className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
														>
															<RedisIcon />
															Redis
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
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input placeholder="Name" {...field} />
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
