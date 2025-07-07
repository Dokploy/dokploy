import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import jsyaml from "js-yaml";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const UpdateTraefikConfigSchema = z.object({
	traefikConfig: z.string(),
});

type UpdateTraefikConfig = z.infer<typeof UpdateTraefikConfigSchema>;

interface Props {
	applicationId: string;
}

export const validateAndFormatYAML = (yamlText: string) => {
	try {
		const obj = jsyaml.load(yamlText);
		const formattedYaml = jsyaml.dump(obj, { indent: 4 });
		return { valid: true, formattedYaml, error: null };
	} catch (error) {
		if (error instanceof jsyaml.YAMLException) {
			return {
				valid: false,
				formattedYaml: yamlText,
				error: error.message,
			};
		}
		return {
			valid: false,
			formattedYaml: yamlText,
			error: "An unexpected error occurred while processing the YAML.",
		};
	}
};

export const UpdateTraefikConfig = ({ applicationId }: Props) => {
	const { t } = useTranslation("dashboard");
	const [open, setOpen] = useState(false);
	const { data, refetch } = api.application.readTraefikConfig.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const { mutateAsync, isLoading, error, isError } =
		api.application.updateTraefikConfig.useMutation();

	const form = useForm<UpdateTraefikConfig>({
		defaultValues: {
			traefikConfig: "",
		},
		resolver: zodResolver(UpdateTraefikConfigSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				traefikConfig: data || "",
			});
		}
	}, [data]);

	const onSubmit = async (data: UpdateTraefikConfig) => {
		const { valid, error } = validateAndFormatYAML(data.traefikConfig);
		if (!valid) {
			form.setError("traefikConfig", {
				type: "manual",
				message: error || t("dashboard.traefik.invalidYAML"),
			});
			return;
		}
		form.clearErrors("traefikConfig");
		await mutateAsync({
			applicationId,
			traefikConfig: data.traefikConfig,
		})
			.then(async () => {
				toast.success(t("dashboard.traefik.traefikConfigUpdated"));
				refetch();
				setOpen(false);
				form.reset();
			})
			.catch(() => {
				toast.error(t("dashboard.traefik.errorUpdatingTraefikConfig"));
			});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(open) => {
				setOpen(open);
				if (!open) {
					form.reset();
				}
			}}
		>
			<DialogTrigger asChild>
				<Button isLoading={isLoading}>{t("dashboard.traefik.modify")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>
						{t("dashboard.traefik.updateTraefikConfig")}
					</DialogTitle>
					<DialogDescription>
						{t("dashboard.traefik.updateTraefikConfigDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-update-traefik-config"
						onSubmit={form.handleSubmit(onSubmit)}
						className="w-full space-y-4 overflow-auto"
					>
						<div className="flex flex-col">
							<FormField
								control={form.control}
								name="traefikConfig"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("dashboard.traefik.traefikConfig")}
										</FormLabel>
										<FormControl>
											<CodeEditor
												lineWrapping
												wrapperClassName="h-[35rem] font-mono"
												placeholder={t(
													"dashboard.traefik.traefikConfigPlaceholder",
												)}
												{...field}
											/>
										</FormControl>

										<pre>
											<FormMessage />
										</pre>
									</FormItem>
								)}
							/>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							form="hook-form-update-traefik-config"
							type="submit"
						>
							{t("dashboard.traefik.update")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
