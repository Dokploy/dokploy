import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
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

	const { mutateAsync, isLoading, error, isError } =
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
		const { valid, error } = validateAndFormatYAML(data.traefikConfig);
		if (!valid) {
			form.setError("traefikConfig", {
				type: "manual",
				message: error || "Invalid YAML",
			});
			return;
		}
		form.clearErrors("traefikConfig");
		await mutateAsync({
			traefikConfig: data.traefikConfig,
			path,
			serverId,
		})
			.then(async () => {
				toast.success("Traefik config Updated");
				refetch();
			})
			.catch(() => {
				toast.error("Error updating the Traefik config");
			});
	};

	return (
		<div>
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
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
								name="traefikConfig"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel>Traefik config</FormLabel>
										<FormDescription className="break-all">
											{path}
										</FormDescription>
										<FormControl>
											<CodeEditor
												lineWrapping
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
									</FormItem>
								)}
							/>
						)}
					</div>
					<div className="flex justify-end">
						<Button
							isLoading={isLoading}
							disabled={canEdit || isLoading}
							type="submit"
						>
							Update
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
