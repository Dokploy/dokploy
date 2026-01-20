import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

export const restartPolicyFormSchema = z.object({
	Condition: z.string().optional(),
	Delay: z.coerce.number().optional(),
	MaxAttempts: z.coerce.number().optional(),
	Window: z.coerce.number().optional(),
});

interface RestartPolicyFormProps {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const RestartPolicyForm = ({ id, type }: RestartPolicyFormProps) => {
	const [isLoading, setIsLoading] = useState(false);

	const queryMap = {
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });

	const mutationMap = {
		postgres: () => api.postgres.update.useMutation(),
		redis: () => api.redis.update.useMutation(),
		mysql: () => api.mysql.update.useMutation(),
		mariadb: () => api.mariadb.update.useMutation(),
		application: () => api.application.update.useMutation(),
		mongo: () => api.mongo.update.useMutation(),
	};

	const { mutateAsync } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const form = useForm<any>({
		resolver: zodResolver(restartPolicyFormSchema),
		defaultValues: {
			Condition: undefined,
			Delay: undefined,
			MaxAttempts: undefined,
			Window: undefined,
		},
	});

	useEffect(() => {
		if (data?.restartPolicySwarm) {
			form.reset({
				Condition: data.restartPolicySwarm.Condition,
				Delay: data.restartPolicySwarm.Delay,
				MaxAttempts: data.restartPolicySwarm.MaxAttempts,
				Window: data.restartPolicySwarm.Window,
			});
		}
	}, [data, form]);

	const onSubmit = async (
		formData: z.infer<typeof restartPolicyFormSchema>,
	) => {
		setIsLoading(true);
		try {
			// Check if all values are empty, if so, send null to clear the database
			const hasAnyValue = Object.values(formData).some(
				(value) => value !== undefined && value !== null && value !== "",
			);

			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				restartPolicySwarm: hasAnyValue ? formData : null,
			});

			toast.success("Restart policy updated successfully");
			refetch();
		} catch {
			toast.error("Error updating restart policy");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<FormField
					control={form.control}
					name="Condition"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Condition</FormLabel>
							<FormDescription>When to restart the container</FormDescription>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select restart condition" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="none">None</SelectItem>
									<SelectItem value="on-failure">On Failure</SelectItem>
									<SelectItem value="any">Any</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="Delay"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Delay (nanoseconds)</FormLabel>
							<FormDescription>
								Wait time between restart attempts
							</FormDescription>
							<FormControl>
								<Input type="number" placeholder="10000000000" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="MaxAttempts"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Max Attempts</FormLabel>
							<FormDescription>
								Maximum number of restart attempts
							</FormDescription>
							<FormControl>
								<Input type="number" placeholder="3" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="Window"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Window (nanoseconds)</FormLabel>
							<FormDescription>
								Time window to evaluate restart policy
							</FormDescription>
							<FormControl>
								<Input type="number" placeholder="10000000000" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							form.reset({
								Condition: undefined,
								Delay: undefined,
								MaxAttempts: undefined,
								Window: undefined,
							});
						}}
					>
						Clear
					</Button>
					<Button type="submit" isLoading={isLoading}>
						Save Restart Policy
					</Button>
				</div>
			</form>
		</Form>
	);
};
