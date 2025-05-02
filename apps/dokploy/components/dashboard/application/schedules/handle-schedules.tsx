import { Button } from "@/components/ui/button";
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
import { z } from "zod";

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	cronExpression: z.string().min(1, "Cron expression is required"),
	command: z.string().min(1, "Command is required"),
});

interface Props {
	applicationId: string;
	onSuccess?: () => void;
	defaultValues?: {
		name: string;
		cronExpression: string;
		command: string;
	};
	scheduleId?: string;
}

export const HandleSchedules = ({
	applicationId,
	onSuccess,
	defaultValues,
	scheduleId,
}: Props) => {
	const utils = api.useContext();
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: defaultValues || {
			name: "",
			cronExpression: "",
			command: "",
		},
	});

	const { mutate: createSchedule, isLoading: isCreating } =
		api.schedule.create.useMutation({
			onSuccess: () => {
				utils.schedule.list.invalidate({ applicationId });
				form.reset();
				onSuccess?.();
			},
		});

	const { mutate: updateSchedule, isLoading: isUpdating } =
		api.schedule.update.useMutation({
			onSuccess: () => {
				utils.schedule.list.invalidate({ applicationId });
				onSuccess?.();
			},
		});

	const isLoading = isCreating || isUpdating;

	const onSubmit = (values: z.infer<typeof formSchema>) => {
		if (scheduleId) {
			updateSchedule({
				...values,
				scheduleId,
				applicationId,
			});
		} else {
			createSchedule({
				...values,
				applicationId,
			});
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Name</FormLabel>
							<FormControl>
								<Input placeholder="Daily backup" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="cronExpression"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Cron Expression</FormLabel>
							<FormControl>
								<Input placeholder="0 0 * * *" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="command"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Command</FormLabel>
							<FormControl>
								<Input placeholder="npm run backup" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<Button type="submit" disabled={isLoading}>
					{scheduleId ? "Update" : "Create"} Schedule
				</Button>
			</form>
		</Form>
	);
};
