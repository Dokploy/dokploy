import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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

export const networkFormSchema = z.object({
	networks: z
		.array(
			z.object({
				Target: z.string().optional(),
				Aliases: z.string().optional(),
			}),
		)
		.optional(),
});

interface NetworkFormProps {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const NetworkForm = ({ id, type }: NetworkFormProps) => {
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

	const form = useForm<z.infer<typeof networkFormSchema>>({
		resolver: zodResolver(networkFormSchema),
		defaultValues: {
			networks: [],
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "networks",
	});

	useEffect(() => {
		if (data?.networkSwarm && Array.isArray(data.networkSwarm)) {
			const networkEntries = data.networkSwarm.map((network) => ({
				Target: network.Target || "",
				Aliases: network.Aliases?.join(", ") || "",
			}));
			form.reset({ networks: networkEntries });
		}
	}, [data, form]);

	const onSubmit = async (formData: z.infer<typeof networkFormSchema>) => {
		setIsLoading(true);
		try {
			const networksArray =
				formData.networks
					?.filter((network) => network.Target)
					.map((network) => ({
						Target: network.Target,
						Aliases: network.Aliases
							? network.Aliases.split(",").map((alias) => alias.trim())
							: undefined,
					})) || [];

			// If no networks, send null to clear the database
			const networksToSend = networksArray.length > 0 ? networksArray : null;

			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				networkSwarm: networksToSend,
			});

			toast.success("Network configuration updated successfully");
			refetch();
		} catch {
			toast.error("Error updating network configuration");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<div>
					<FormLabel>Networks</FormLabel>
					<FormDescription>
						Configure network attachments for your service
					</FormDescription>
					<div className="space-y-2 mt-2">
						{fields.map((field, index) => (
							<div key={field.id} className="space-y-2 p-3 border rounded">
								<FormField
									control={form.control}
									name={`networks.${index}.Target`}
									render={({ field }) => (
										<FormItem>
											<FormLabel>Network Name</FormLabel>
											<FormControl>
												<Input {...field} placeholder="my-network" />
											</FormControl>
											<FormDescription>
												The name of the network to attach to
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name={`networks.${index}.Aliases`}
									render={({ field }) => (
										<FormItem>
											<FormLabel>Aliases (optional)</FormLabel>
											<FormControl>
												<Input
													{...field}
													placeholder="alias1, alias2, alias3"
												/>
											</FormControl>
											<FormDescription>
												Comma-separated list of network aliases
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => remove(index)}
								>
									Remove Network
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => append({ Target: "", Aliases: "" })}
						>
							Add Network
						</Button>
					</div>
				</div>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							form.reset({ networks: [] });
						}}
					>
						Clear
					</Button>
					<Button type="submit" isLoading={isLoading}>
						Save Networks
					</Button>
				</div>
			</form>
		</Form>
	);
};
