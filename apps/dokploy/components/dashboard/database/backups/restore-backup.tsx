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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const RestoreBackupSchema = z.object({
	backupId: z.string().min(1, "Backup ID required"),
});

type RestoreBackup = z.infer<typeof RestoreBackupSchema>;

interface Props {
	refetch: () => void;
}

export const RestoreBackup = ({ refetch }: Props) => {
	const { mutateAsync: restoreBackup, isLoading: isRestoringBackup } =
		api.backup.restore.useMutation();

	const form = useForm<RestoreBackup>({
		defaultValues: {
			backupId: "",
		},
		resolver: zodResolver(RestoreBackupSchema),
	});

	const onSubmit = async (data: RestoreBackup) => {
		await restoreBackup({
			backupId: data.backupId,
		})
			.then(async () => {
				toast.success("Backup Restored");
				refetch();
			})
			.catch(() => {
				toast.error("Error to restore the backup");
			});
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>
					Restore Backup
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg max-h-screen overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Restore a backup</DialogTitle>
					<DialogDescription>Restore a database backup</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-restore-backup"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="grid grid-cols-1 gap-4">
							<FormField
								control={form.control}
								name="backupId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Backup ID</FormLabel>
										<FormControl>
											<Input placeholder={"Enter Backup ID"} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<DialogFooter>
							<Button
								isLoading={isRestoringBackup}
								form="hook-form-restore-backup"
								type="submit"
							>
								Restore
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
