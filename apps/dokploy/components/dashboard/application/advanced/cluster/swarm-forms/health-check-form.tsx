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
import { api } from "@/utils/api";

export const healthCheckFormSchema = z.object({
	Test: z.array(z.string()).optional(),
	Interval: z.coerce.number().optional(),
	Timeout: z.coerce.number().optional(),
	StartPeriod: z.coerce.number().optional(),
	Retries: z.coerce.number().optional(),
});

interface HealthCheckFormProps {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const HealthCheckForm = ({ id, type }: HealthCheckFormProps) => {
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
		resolver: zodResolver(healthCheckFormSchema),
		defaultValues: {
			Test: [],
			Interval: undefined,
			Timeout: undefined,
			StartPeriod: undefined,
			Retries: undefined,
		},
	});

	const testCommands = form.watch("Test") || [];

	useEffect(() => {
		if (data?.healthCheckSwarm) {
			const hc = data.healthCheckSwarm;
			form.reset({
				Test: hc.Test || [],
				Interval: hc.Interval,
				Timeout: hc.Timeout,
				StartPeriod: hc.StartPeriod,
				Retries: hc.Retries,
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: z.infer<typeof healthCheckFormSchema>) => {
		setIsLoading(true);
		try {
			// Check if all values are empty, if so, send null to clear the database
			const hasAnyValue =
				(formData.Test && formData.Test.length > 0) ||
				formData.Interval !== undefined ||
				formData.Timeout !== undefined ||
				formData.StartPeriod !== undefined ||
				formData.Retries !== undefined;

			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				healthCheckSwarm: hasAnyValue ? formData : null,
			});

			toast.success("Health check updated successfully");
			refetch();
		} catch {
			toast.error("Error updating health check");
		} finally {
			setIsLoading(false);
		}
	};

	const addTestCommand = () => {
		form.setValue("Test", [...testCommands, ""]);
	};

	const updateTestCommand = (index: number, value: string) => {
		const newCommands = [...testCommands];
		newCommands[index] = value;
		form.setValue("Test", newCommands);
	};

	const removeTestCommand = (index: number) => {
		form.setValue(
			"Test",
			testCommands.filter((_: string, i: number) => i !== index),
		);
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<div>
					<FormLabel>Test Commands</FormLabel>
					<FormDescription>
						Command to run for health check (e.g., ["CMD-SHELL", "curl -f
						http://localhost:3000/health"])
					</FormDescription>
					<div className="space-y-2 mt-2">
						{testCommands.map((cmd: string, index: number) => (
							<div key={index} className="flex gap-2">
								<Input
									value={cmd}
									onChange={(e) => updateTestCommand(index, e.target.value)}
									placeholder={
										index === 0
											? "CMD-SHELL"
											: "curl -f http://localhost:3000/health"
									}
								/>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => removeTestCommand(index)}
								>
									Remove
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addTestCommand}
						>
							Add Command
						</Button>
					</div>
				</div>

				<FormField
					control={form.control}
					name="Interval"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Interval (nanoseconds)</FormLabel>
							<FormDescription>
								Time between health checks (e.g., 10000000000 for 10 seconds)
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
					name="Timeout"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Timeout (nanoseconds)</FormLabel>
							<FormDescription>
								Maximum time to wait for health check response
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
					name="StartPeriod"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Start Period (nanoseconds)</FormLabel>
							<FormDescription>
								Initial grace period before health checks begin
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
					name="Retries"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Retries</FormLabel>
							<FormDescription>
								Number of consecutive failures needed to consider container
								unhealthy
							</FormDescription>
							<FormControl>
								<Input type="number" placeholder="3" {...field} />
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
								Test: [],
								Interval: undefined,
								Timeout: undefined,
								StartPeriod: undefined,
								Retries: undefined,
							});
						}}
					>
						Clear
					</Button>
					<Button type="submit" isLoading={isLoading}>
						Save Health Check
					</Button>
				</div>
			</form>
		</Form>
	);
};
