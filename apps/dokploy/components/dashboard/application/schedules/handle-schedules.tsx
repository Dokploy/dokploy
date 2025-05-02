import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Clock, Terminal, Info, PlusCircle, PenBoxIcon } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const commonCronExpressions = [
	{ label: "Every minute", value: "* * * * *" },
	{ label: "Every hour", value: "0 * * * *" },
	{ label: "Every day at midnight", value: "0 0 * * *" },
	{ label: "Every Sunday at midnight", value: "0 0 * * 0" },
	{ label: "Every month on the 1st at midnight", value: "0 0 1 * *" },
	{ label: "Every 15 minutes", value: "*/15 * * * *" },
	{ label: "Every weekday at midnight", value: "0 0 * * 1-5" },
];

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	cronExpression: z.string().min(1, "Cron expression is required"),
	shellType: z.enum(["bash", "sh"]).default("bash"),
	command: z.string().min(1, "Command is required"),
	enabled: z.boolean().default(true),
});

interface Props {
	applicationId?: string;
	scheduleId?: string;
}

export const HandleSchedules = ({ applicationId, scheduleId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			cronExpression: "",
			shellType: "bash",
			command: "",
			enabled: true,
		},
	});

	const { data: schedule } = api.schedule.one.useQuery(
		{ scheduleId: scheduleId || "" },
		{ enabled: !!scheduleId },
	);

	useEffect(() => {
		if (scheduleId && schedule) {
			form.reset({
				name: schedule.name,
				cronExpression: schedule.cronExpression,
				shellType: schedule.shellType,
				command: schedule.command,
				enabled: schedule.enabled,
			});
		}
	}, [form, schedule, scheduleId]);

	const { mutateAsync, isLoading } = scheduleId
		? api.schedule.update.useMutation()
		: api.schedule.create.useMutation();

	const onSubmit = async (values: z.infer<typeof formSchema>) => {
		if (!applicationId && !scheduleId) return;

		await mutateAsync({
			...values,
			scheduleId: scheduleId || "",
			applicationId: applicationId || "",
		})
			.then(() => {
				toast.success(
					`Schedule ${scheduleId ? "updated" : "created"} successfully`,
				);
				utils.schedule.list.invalidate({ applicationId });
				setIsOpen(false);
			})
			.catch((error) => {
				toast.error(
					error instanceof Error ? error.message : "An unknown error occurred",
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{scheduleId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>
						<PlusCircle className="w-4 h-4 mr-2" />
						Add Schedule
					</Button>
				)}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{scheduleId ? "Edit" : "Create"} Schedule</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Clock className="w-4 h-4" />
										Task Name
									</FormLabel>
									<FormControl>
										<Input placeholder="Daily Database Backup" {...field} />
									</FormControl>
									<FormDescription>
										A descriptive name for your scheduled task
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="cronExpression"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Clock className="w-4 h-4" />
										Schedule
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<Info className="w-4 h-4 text-muted-foreground cursor-help" />
												</TooltipTrigger>
												<TooltipContent>
													<p>
														Cron expression format: minute hour day month
														weekday
													</p>
													<p>Example: 0 0 * * * (daily at midnight)</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</FormLabel>
									<Select
										onValueChange={(value) => field.onChange(value)}
										value={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select or type a cron expression" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{commonCronExpressions.map((expr) => (
												<SelectItem key={expr.value} value={expr.value}>
													{expr.label} ({expr.value})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormControl>
										<Input
											placeholder="Custom cron expression (e.g., 0 0 * * *)"
											{...field}
											className="mt-2"
										/>
									</FormControl>
									<FormDescription>
										Choose a predefined schedule or enter a custom cron
										expression
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="shellType"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Terminal className="w-4 h-4" />
										Shell Type
									</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select shell type" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="bash">Bash</SelectItem>
											<SelectItem value="sh">Sh</SelectItem>
										</SelectContent>
									</Select>
									<FormDescription>
										Choose the shell to execute your command
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="command"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Terminal className="w-4 h-4" />
										Command
									</FormLabel>
									<FormControl>
										<Input
											placeholder="docker exec my-container npm run backup"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										The command to execute in your container
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="enabled"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
										Enabled
									</FormLabel>
								</FormItem>
							)}
						/>

						<Button type="submit" disabled={isLoading} className="w-full">
							{isLoading ? (
								<>
									<Clock className="mr-2 h-4 w-4 animate-spin" />
									{scheduleId ? "Updating..." : "Creating..."}
								</>
							) : (
								<>{scheduleId ? "Update" : "Create"} Schedule</>
							)}
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
