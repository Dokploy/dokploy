import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { validateAndFormatYAML } from "../application/advanced/traefik/update-traefik-config";

const UpdateServerMiddlewareConfigSchema = z.object({
	webServerConfig: z.string(),
});

type UpdateServerMiddlewareConfig = z.infer<
	typeof UpdateServerMiddlewareConfigSchema
>;

interface Props {
	path: string;
	serverId?: string;
	activeProvider?: "traefik" | "caddy";
}

export const ShowTraefikFile = ({ path, serverId, activeProvider }: Props) => {
	const providerLabel =
		activeProvider === "caddy"
			? "Caddy"
			: activeProvider === "traefik"
				? "Traefik"
				: "Web Server";
	const isTraefik = activeProvider === "traefik";
	const {
		data,
		refetch,
		isLoading: isLoadingFile,
		error: readError,
		isError: isReadError,
	} = api.settings.readWebServerFile.useQuery(
		{
			path,
			serverId,
		},
		{
			enabled: !!path,
		},
	);
	const [canEdit, setCanEdit] = useState(true);
	const [skipYamlValidation, setSkipYamlValidation] = useState(false);

	const { mutateAsync, isPending, error, isError } =
		api.settings.updateWebServerFile.useMutation();

	const form = useForm<UpdateServerMiddlewareConfig>({
		defaultValues: {
			webServerConfig: "",
		},
		disabled: !isTraefik || canEdit,
		resolver: zodResolver(UpdateServerMiddlewareConfigSchema),
	});

	useEffect(() => {
		form.reset({
			webServerConfig: data || "",
		});
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateServerMiddlewareConfig) => {
		if (!isTraefik) {
			return;
		}
		if (!skipYamlValidation) {
			const { valid, error } = validateAndFormatYAML(data.webServerConfig);
			if (!valid) {
				form.setError("webServerConfig", {
					type: "manual",
					message: error || "Invalid YAML",
				});
				return;
			}
		}
		form.clearErrors("webServerConfig");
		await mutateAsync({
			webServerConfig: data.webServerConfig,
			path,
			serverId,
		})
			.then(async () => {
				toast.success(`${providerLabel} config updated`);
				refetch();
			})
			.catch(() => {
				toast.error(`Error updating the ${providerLabel} config`);
			});
	};

	return (
		<div>
			{isReadError && (
				<AlertBlock type="error">{readError?.message}</AlertBlock>
			)}
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			{activeProvider === "caddy" && (
				<AlertBlock type="info" className="mb-4">
					Caddy generated files are read-only from this view. Use Dokploy
					settings, domains, and migration controls to change generated Caddy
					config.
				</AlertBlock>
			)}
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="w-full relative z-[5]"
				>
					<div className="flex flex-col overflow-auto">
						{isLoadingFile ? (
							<div className="w-full flex-col gap-2 flex items-center justify-center h-[55vh]">
								<span className="text-muted-foreground text-lg font-medium">
									Loading...
								</span>
								<Loader2 className="animate-spin size-8 text-muted-foreground" />
							</div>
						) : (
							<FormField
								control={form.control}
								name="webServerConfig"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel>{providerLabel} config</FormLabel>
										<FormDescription className="break-all">
											{path}
										</FormDescription>
										<FormControl>
											<CodeEditor
												disabled={!isTraefik || canEdit}
												lineWrapping
												language={activeProvider === "caddy" ? "json" : "yaml"}
												wrapperClassName="h-[35rem] font-mono"
												placeholder={`http:
routers:
    router-name:
        rule: Host('domain.com')
        service: container-name
        entryPoints:
            - web
        tls: false
        middlewares: []
                                                    `}
												{...field}
											/>
										</FormControl>

										<pre>
											<FormMessage />
										</pre>
										{isTraefik && (
											<div className="flex justify-end absolute z-50 right-6 top-8">
												<Button
													className="shadow-sm"
													variant="secondary"
													type="button"
													onClick={async () => {
														setCanEdit(!canEdit);
													}}
												>
													{canEdit ? "Unlock" : "Lock"}
												</Button>
											</div>
										)}
									</FormItem>
								)}
							/>
						)}
					</div>
					{isTraefik && (
						<div className="flex flex-col gap-4">
							<div className="flex items-center space-x-2">
								<Checkbox
									id="skip-yaml-validation"
									checked={skipYamlValidation}
									onCheckedChange={(checked) =>
										setSkipYamlValidation(checked === true)
									}
								/>
								<Label
									htmlFor="skip-yaml-validation"
									className="text-sm font-normal cursor-pointer"
								>
									Skip YAML validation (for Go templating)
								</Label>
							</div>
							<p className="text-sm text-muted-foreground -mt-2">
								Traefik supports Go templating in dynamic configs (e.g.{" "}
								<code className="text-xs">{"{{range}}"}</code>). Configs using
								templates will fail standard YAML validation. Check this to save
								without validation.
							</p>
							<div className="flex justify-end">
								<Button
									isLoading={isPending}
									disabled={canEdit || isLoadingFile}
									type="submit"
								>
									Update
								</Button>
							</div>
						</div>
					)}
				</form>
			</Form>
		</div>
	);
};
