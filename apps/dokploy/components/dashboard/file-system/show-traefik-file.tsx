import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
	traefikConfig: z.string(),
});

type UpdateServerMiddlewareConfig = z.infer<
	typeof UpdateServerMiddlewareConfigSchema
>;

interface Props {
	path: string;
	serverId?: string;
}

export const ShowTraefikFile = ({ path, serverId }: Props) => {
	const { t } = useTranslation();
	const {
		data,
		refetch,
		isLoading: isLoadingFile,
	} = api.settings.readTraefikFile.useQuery(
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
		api.settings.updateTraefikFile.useMutation();

	const form = useForm<UpdateServerMiddlewareConfig>({
		defaultValues: {
			traefikConfig: "",
		},
		disabled: canEdit,
		resolver: zodResolver(UpdateServerMiddlewareConfigSchema),
	});

	useEffect(() => {
		form.reset({
			traefikConfig: data || "",
		});
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateServerMiddlewareConfig) => {
		if (!skipYamlValidation) {
			const { valid, error } = validateAndFormatYAML(data.traefikConfig);
			if (!valid) {
				form.setError("traefikConfig", {
					type: "manual",
					message: error || t("fileSystem.invalidYaml"),
				});
				return;
			}
		}
		form.clearErrors("traefikConfig");
		await mutateAsync({
			traefikConfig: data.traefikConfig,
			path,
			serverId,
		})
			.then(async () => {
				toast.success(t("fileSystem.updated"));
				refetch();
			})
			.catch(() => {
				toast.error(t("fileSystem.updateError"));
			});
	};

	return (
		<div>
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="w-full relative z-5"
				>
					<div className="flex flex-col overflow-auto">
						{isLoadingFile ? (
							<div className="w-full flex-col gap-2 flex items-center justify-center h-[55vh]">
								<span className="text-muted-foreground text-lg font-medium">
									{t("common.loading")}
								</span>
								<Loader2 className="animate-spin size-8 text-muted-foreground" />
							</div>
						) : (
							<FormField
								control={form.control}
								name="traefikConfig"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel>{t("fileSystem.traefikConfig")}</FormLabel>
										<FormDescription className="break-all">
											{path}
										</FormDescription>
										<FormControl>
											<CodeEditor
												lineWrapping
												wrapperClassName="h-140 font-mono"
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
										<div className="flex justify-end absolute z-50 right-6 top-8">
											<Button
												className="shadow-xs"
												variant="secondary"
												type="button"
												onClick={async () => {
													setCanEdit(!canEdit);
												}}
											>
												{canEdit
													? t("fileSystem.unlock")
													: t("fileSystem.lock")}
											</Button>
										</div>
									</FormItem>
								)}
							/>
						)}
					</div>
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
								{t("fileSystem.skipYamlValidation")}
							</Label>
						</div>
						<p className="text-sm text-muted-foreground -mt-2">
							{t("fileSystem.goTemplatingHint")}
							<code className="text-xs">{"{{range}}"}</code>
							{t("fileSystem.goTemplatingHintSuffix")}
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
				</form>
			</Form>
		</div>
	);
};
