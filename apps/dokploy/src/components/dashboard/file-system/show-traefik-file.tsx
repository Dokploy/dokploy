import { Button } from "~/components/ui/button";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "~/components/shared/alert-block";
import { CodeEditor } from "~/components/shared/code-editor";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "~/components/ui/form";
import { api } from "~/utils/api";
import { validateAndFormatYAML } from "../application/advanced/traefik/update-traefik-config";

const UpdateServerMiddlewareConfigSchema = z.object({
	traefikConfig: z.string(),
});

type UpdateServerMiddlewareConfig = z.infer<
	typeof UpdateServerMiddlewareConfigSchema
>;

interface Props {
	path: string;
}

export const ShowTraefikFile = ({ path }: Props) => {
	const { data, refetch } = api.settings.readTraefikFile.useQuery(
		{
			path,
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
		if (data) {
			form.reset({
				traefikConfig: data || "",
			});
		}
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
		})
			.then(async () => {
				toast.success("Traefik config Updated");
				refetch();
			})
			.catch(() => {
				toast.error("Error to update the traefik config");
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
					</div>
					<div className="flex justify-end">
						<Button isLoading={isLoading} disabled={canEdit} type="submit">
							Update
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
};
