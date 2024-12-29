import { api } from "@/utils/api";
import { useRouter } from "next/router";
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
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, NumberInput } from "@/components/ui/input";
import { CardTitle } from "@/components/ui/card";
import { AlertTriangle, BarChart, BarcodeIcon } from "lucide-react";
import { useEffect } from "react";

interface Props {
	serverId: string;
}

const Schema = z.object({
	refreshRate: z.number().min(2, {
		message: "Refresh Rate is required",
	}),
	port: z.number({
		required_error: "Port is required",
	}),
});

type Schema = z.infer<typeof Schema>;

export const SetupMonitoring = ({ serverId }: Props) => {
	const { data, refetch } = api.server.one.useQuery({ serverId });

	const { mutateAsync, isLoading, isError, error } =
		api.server.setupMonitoring.useMutation();

	const form = useForm<Schema>({
		defaultValues: {
			refreshRate: 5,
			port: 4500,
		},
		resolver: zodResolver(Schema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				refreshRate: data.refreshRateMetrics,
				port: data.defaultPortMetrics,
			});
		}
	}, [data]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			refreshRateMetrics: data.refreshRate,
			defaultPortMetrics: data.port,
			serverId,
		})
			.then(async (data) => {
				toast.success("Metrics configured successfully");
				await refetch();
			})
			.catch(() => {
				toast.error("Error configuring the metrics");
			});
	};
	return (
		<div className="w-full flex flex-col border p-4 rounded-lg">
			<span>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						{isError && (
							<div className="flex flex-row gap-4 rounded-lg items-center bg-red-50 p-2 dark:bg-red-950">
								<AlertTriangle className="text-red-600 dark:text-red-400" />
								<span className="text-sm text-red-600 dark:text-red-400">
									{error?.message}
								</span>
							</div>
						)}
						<CardTitle className="text-xl font-bold flex gap-1">
							<BarChart />
							Metrics
						</CardTitle>
						To enable metrics on this server please configure the following
						variables
						<FormField
							control={form.control}
							name="refreshRate"
							render={({ field }) => (
								<FormItem className="flex flex-col justify-center max-sm:items-center">
									<FormLabel>Refresh Rate</FormLabel>
									<FormControl>
										<NumberInput placeholder="10" {...field} />
									</FormControl>
									<FormDescription>
										Please set the refresh rate for the metrics in seconds
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="port"
							render={({ field }) => (
								<FormItem className="flex flex-col justify-center max-sm:items-center">
									<FormLabel>Port </FormLabel>
									<FormControl>
										<Input placeholder="4500" {...field} />
									</FormControl>
									<FormDescription>
										Please set the port to make the container expose
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex flex-row justify-end">
							<Button isLoading={isLoading} type="submit" className="w-fit">
								Configure
							</Button>
						</div>
					</form>
				</Form>
			</span>
		</div>
	);
};
