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
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const AddCloudBackupSchema = z.object({
	destinationId: z.string().min(1, "Destination required"),
	schedule: z.string().min(1, "Schedule (Cron) required"),
	prefix: z.string().min(1, "Prefix required"),
	enabled: z.boolean(),
	database: z.string().min(1, "Database required"),
	keepLatestCount: z.coerce.number().optional(),
});

type AddCloudBackup = z.infer<typeof AddCloudBackupSchema>;

interface Props {
	databaseId: string;
	databaseType: "postgres" | "mariadb" | "mysql" | "mongo" | "web-server";
	refetch: () => void;
}

export const AddCloudBackup = ({
	databaseId,
	databaseType,
	refetch,
}: Props) => {
	const { data: cloudDestinations, isLoading: isLoadingDestinations } =
		api.cloudStorageDestination.all.useQuery();

	const { mutateAsync: createBackup, isLoading: isCreating } =
		api.cloudStorageBackup.create.useMutation();

	const form = useForm<AddCloudBackup>({
		defaultValues: {
			database: "",
			destinationId: "",
			enabled: true,
			prefix: "/",
			schedule: "",
			keepLatestCount: undefined,
		},
		resolver: zodResolver(AddCloudBackupSchema),
	});

	useEffect(() => {
		form.reset({
			database: databaseType === "web-server" ? "dokploy" : "",
			destinationId: "",
			enabled: true,
			prefix: "/",
			schedule: "",
			keepLatestCount: undefined,
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddCloudBackup) => {
		try {
			await createBackup({
				...data,
				databaseType,
				cloudStorageDestinationId: data.destinationId,
				postgresId: databaseType === "postgres" ? databaseId : undefined,
				mysqlId: databaseType === "mysql" ? databaseId : undefined,
				mariadbId: databaseType === "mariadb" ? databaseId : undefined,
				mongoId: databaseType === "mongo" ? databaseId : undefined,
			});

			toast.success("Cloud backup created successfully");
			refetch();
		} catch (error) {
			toast.error("Failed to create cloud backup");
			console.error(error);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon className="mr-2 h-4 w-4" />
					Add Cloud Backup
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Add Cloud Backup</DialogTitle>
					<DialogDescription>
						Configure a new backup to your cloud storage destination.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="destinationId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Destination</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
										disabled={isLoadingDestinations}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a destination" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{cloudDestinations?.map((destination) => (
												<SelectItem key={destination.id} value={destination.id}>
													{destination.name} ({destination.provider})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="schedule"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Schedule (Cron)</FormLabel>
									<FormControl>
										<Input placeholder="0 0 * * *" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="prefix"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Prefix</FormLabel>
									<FormControl>
										<Input placeholder="/backups/" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="database"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Database</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="keepLatestCount"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Keep Latest Count</FormLabel>
									<FormControl>
										<Input
											type="number"
											placeholder="Number of backups to keep"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button type="submit" isLoading={isCreating}>
								Create Backup
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
