import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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

const hasStopGracePeriodSwarm = (
	value: unknown,
): value is { stopGracePeriodSwarm: bigint | number | string | null } =>
	typeof value === "object" &&
	value !== null &&
	"stopGracePeriodSwarm" in value;

interface StopGracePeriodFormProps {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const StopGracePeriodForm = ({ id, type }: StopGracePeriodFormProps) => {
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
		defaultValues: {
			value: null as bigint | null,
		},
	});

	useEffect(() => {
		if (hasStopGracePeriodSwarm(data)) {
			const value = data.stopGracePeriodSwarm;
			const normalizedValue =
				value === null || value === undefined
					? null
					: typeof value === "bigint"
						? value
						: BigInt(value);
			form.reset({
				value: normalizedValue,
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: any) => {
		setIsLoading(true);
		try {
			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				stopGracePeriodSwarm: formData.value,
			});

			toast.success("Stop grace period updated successfully");
			refetch();
		} catch {
			toast.error("Error updating stop grace period");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<FormField
					control={form.control}
					name="value"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Stop Grace Period (nanoseconds)</FormLabel>
							<FormDescription>
								Time to wait before forcefully killing the container
								<br />
								Examples: 30000000000 (30s), 120000000000 (2m)
							</FormDescription>
							<FormControl>
								<Input
									type="number"
									placeholder="30000000000"
									{...field}
									value={
										field?.value !== null && field?.value !== undefined
											? field.value.toString()
											: ""
									}
									onChange={(e) =>
										field.onChange(
											e.target.value ? BigInt(e.target.value) : null,
										)
									}
								/>
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
								value: null,
							});
						}}
					>
						Clear
					</Button>
					<Button type="submit" isLoading={isLoading}>
						Save Stop Grace Period
					</Button>
				</div>
			</form>
		</Form>
	);
};
