import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const AddPostgresBackup1Schema = z.object({
	destinationId: z.string().min(1, "Destination required"),
	schedule: z.string().min(1, "Schedule (Cron) required"),
	// .regex(
	//   new RegExp(
	//     /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/,
	//   ),
	//   "Invalid Cron",
	// ),
	prefix: z.string().min(1, "Prefix required"),
	enabled: z.boolean(),
	database: z.string().min(1, "Database required"),
});

type AddPostgresBackup = z.infer<typeof AddPostgresBackup1Schema>;

interface Props {
	databaseId: string;
	databaseType: "postgres" | "mariadb" | "mysql" | "mongo";
	refetch: () => void;
}

export const AddBackup = ({ databaseId, databaseType, refetch }: Props) => {
	const { data, isLoading } = api.destination.all.useQuery();

	const { mutateAsync: createBackup, isLoading: isCreatingPostgresBackup } =
		api.backup.create.useMutation();

	const form = useForm<AddPostgresBackup>({
		defaultValues: {
			database: "",
			destinationId: "",
			enabled: true,
			prefix: "/",
			schedule: "",
		},
		resolver: zodResolver(AddPostgresBackup1Schema),
	});

	useEffect(() => {
		form.reset({
			database: "",
			destinationId: "",
			enabled: true,
			prefix: "/",
			schedule: "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddPostgresBackup) => {
		const getDatabaseId =
			databaseType === "postgres"
				? {
						postgresId: databaseId,
					}
				: databaseType === "mariadb"
					? {
							mariadbId: databaseId,
						}
					: databaseType === "mysql"
						? {
								mysqlId: databaseId,
							}
						: databaseType === "mongo"
							? {
									mongoId: databaseId,
								}
							: undefined;

		await createBackup({
			destinationId: data.destinationId,
			prefix: data.prefix,
			schedule: data.schedule,
			enabled: data.enabled,
			database: data.database,
			databaseType,
			...getDatabaseId,
		})
			.then(async () => {
				toast.success("Backup Created");
				refetch();
			})
			.catch(() => {
				toast.error("Error creating a backup");
			});
	};
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon className="h-4 w-4" />
					Create Backup
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg max-h-screen overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create a backup</DialogTitle>
					<DialogDescription>Add a new backup</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-add-backup"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="grid grid-cols-1 gap-4">
							<FormField
								control={form.control}
								name="destinationId"
								render={({ field }) => (
									<FormItem className="">
										<FormLabel>Destination</FormLabel>
										<Popover>
											<PopoverTrigger asChild>
												<FormControl>
													<Button
														variant="outline"
														className={cn(
															"w-full justify-between !bg-input",
															!field.value && "text-muted-foreground",
														)}
													>
														{isLoading
															? "Loading...."
															: field.value
																? data?.find(
																		(destination) =>
																			destination.destinationId === field.value,
																	)?.name
																: "Select Destination"}

														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent className="p-0" align="start">
												<Command>
													<CommandInput
														placeholder="Search Destination..."
														className="h-9"
													/>
													{isLoading && (
														<span className="py-6 text-center text-sm">
															Loading Destinations....
														</span>
													)}
													<CommandEmpty>No destinations found.</CommandEmpty>
													<ScrollArea className="h-64">
														<CommandGroup>
															{data?.map((destination) => (
																<CommandItem
																	value={destination.destinationId}
																	key={destination.destinationId}
																	onSelect={() => {
																		form.setValue(
																			"destinationId",
																			destination.destinationId,
																		);
																	}}
																>
																	{destination.name}
																	<CheckIcon
																		className={cn(
																			"ml-auto h-4 w-4",
																			destination.destinationId === field.value
																				? "opacity-100"
																				: "opacity-0",
																		)}
																	/>
																</CommandItem>
															))}
														</CommandGroup>
													</ScrollArea>
												</Command>
											</PopoverContent>
										</Popover>

										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="database"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Database</FormLabel>
											<FormControl>
												<Input placeholder={"dokploy"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="schedule"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Schedule (Cron)</FormLabel>
											<FormControl>
												<Input placeholder={"0 0 * * *"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="prefix"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Prefix Destination</FormLabel>
											<FormControl>
												<Input placeholder={"dokploy/"} {...field} />
											</FormControl>
											<FormDescription>
												Use if you want to storage in a specific path of your
												destination/bucket
											</FormDescription>

											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 ">
										<div className="space-y-0.5">
											<FormLabel>Enabled</FormLabel>
											<FormDescription>
												Enable or disable the backup
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
						</div>
						<DialogFooter>
							<Button
								isLoading={isCreatingPostgresBackup}
								form="hook-form-add-backup"
								type="submit"
							>
								Create
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
