import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const updateBackupSchema = z.object({
	schedule: z.string().min(1, "Schedule is required"),
	prefix: z.string().min(1, "Prefix is required"),
	enabled: z.boolean(),
	keepLatestCount: z.string().optional(),
});

interface Props {
	backupId: string;
	refetch: () => void;
}

export const UpdateCloudBackup = ({ backupId, refetch }: Props) => {
	const [open, setOpen] = useState(false);

	const { data: backup, isLoading: isLoadingBackup } =
		api.cloudStorageBackup.get.useQuery({ backupId });

	const { mutateAsync: updateBackup, isLoading: isUpdating } =
		api.cloudStorageBackup.update.useMutation();

	const form = useForm<z.infer<typeof updateBackupSchema>>({
		resolver: zodResolver(updateBackupSchema),
		defaultValues: {
			schedule: backup?.schedule || "",
			prefix: backup?.prefix || "",
			enabled: backup?.enabled || false,
			keepLatestCount: backup?.keepLatestCount?.toString() || "",
		},
	});

	const onSubmit = async (values: z.infer<typeof updateBackupSchema>) => {
		await updateBackup({
			backupId,
			schedule: values.schedule,
			prefix: values.prefix,
			enabled: values.enabled,
			keepLatestCount: values.keepLatestCount
				? Number.parseInt(values.keepLatestCount)
				: undefined,
		})
			.then(() => {
				toast.success("Backup updated successfully");
				refetch();
				setOpen(false);
			})
			.catch(() => {
				toast.error("Error updating backup");
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon">
					<Pencil className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Update Cloud Backup</DialogTitle>
					<DialogDescription>
						Modify the settings for your cloud storage backup.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="schedule"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Schedule (Cron Expression)</FormLabel>
									<FormControl>
										<Input
											placeholder="0 0 * * *"
											{...field}
											disabled={isLoadingBackup || isUpdating}
										/>
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
									<FormLabel>Storage Prefix</FormLabel>
									<FormControl>
										<Input
											placeholder="backups/database"
											{...field}
											disabled={isLoadingBackup || isUpdating}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="enabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">Enabled</FormLabel>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
											disabled={isLoadingBackup || isUpdating}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="keepLatestCount"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Keep Latest Count (Optional)</FormLabel>
									<FormControl>
										<Input
											type="number"
											placeholder="10"
											{...field}
											disabled={isLoadingBackup || isUpdating}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex justify-end gap-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
								disabled={isUpdating}
							>
								Cancel
							</Button>
							<Button type="submit" isLoading={isUpdating}>
								Update
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
