import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const externalUpstreamSettingsSchema = z.object({
	externalUpstreamsEnabled: z.boolean(),
	externalUpstreamBlockedCidrs: z.string(),
});

type ExternalUpstreamSettingsForm = z.infer<typeof externalUpstreamSettingsSchema>;

export const ExternalUpstreamSettings = () => {
	const utils = api.useUtils();
	const { data } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync, isPending } =
		api.settings.updateExternalUpstreamSettings.useMutation();

	const form = useForm<ExternalUpstreamSettingsForm>({
		defaultValues: {
			externalUpstreamsEnabled: false,
			externalUpstreamBlockedCidrs: "",
		},
		resolver: zodResolver(externalUpstreamSettingsSchema),
	});

	useEffect(() => {
		form.reset({
			externalUpstreamsEnabled: data?.externalUpstreamsEnabled || false,
			externalUpstreamBlockedCidrs:
				data?.externalUpstreamBlockedCidrs?.join("\n") || "",
		});
	}, [data, form]);

	const onSubmit = async (values: ExternalUpstreamSettingsForm) => {
		await mutateAsync({
			externalUpstreamsEnabled: values.externalUpstreamsEnabled,
			externalUpstreamBlockedCidrs: values.externalUpstreamBlockedCidrs
				.split("\n")
				.map((value) => value.trim())
				.filter(Boolean),
		})
			.then(async () => {
				toast.success("External Upstream settings updated");
				await utils.settings.getWebServerSettings.invalidate();
			})
			.catch((error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Error updating external upstream settings",
				);
			});
	};

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-4 rounded-xl border p-4"
			>
				<FormField
					control={form.control}
					name="externalUpstreamsEnabled"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center justify-between">
							<div className="space-y-1">
								<FormLabel>Enable External Upstreams</FormLabel>
								<p className="text-sm text-muted-foreground">
									Allow Traefik-managed reverse proxy entries to upstream
									services hosted outside Dokploy
								</p>
							</div>
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="externalUpstreamBlockedCidrs"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Blocked CIDRs</FormLabel>
							<FormControl>
								<Textarea
									rows={6}
									placeholder={"127.0.0.0/8\n169.254.0.0/16"}
									{...field}
								/>
							</FormControl>
							<p className="text-sm text-muted-foreground">
								One CIDR or IP per line. These ranges are rejected for upstream
								targets.
							</p>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="flex justify-end">
					<Button type="submit" isLoading={isPending}>
						Save
					</Button>
				</div>
			</form>
		</Form>
	);
};
