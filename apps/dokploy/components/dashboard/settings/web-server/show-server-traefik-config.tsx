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
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { validateAndFormatYAML } from "../../application/advanced/traefik/update-traefik-config";

const UpdateServerTraefikConfigSchema = z.object({
	traefikConfig: z.string(),
});

type UpdateServerTraefikConfig = z.infer<
	typeof UpdateServerTraefikConfigSchema
>;

interface Props {
	children?: React.ReactNode;
}

export const ShowServerTraefikConfig = ({ children }: Props) => {
	const { data, refetch } = api.settings.readWebServerTraefikConfig.useQuery();
	const [canEdit, setCanEdit] = useState(true);

	const { mutateAsync, isLoading, error, isError } =
		api.settings.updateWebServerTraefikConfig.useMutation();

	const form = useForm<UpdateServerTraefikConfig>({
		defaultValues: {
			traefikConfig: "",
		},
		disabled: canEdit,
		resolver: zodResolver(UpdateServerTraefikConfigSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				traefikConfig: data || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateServerTraefikConfig) => {
		const { valid, error } = validateAndFormatYAML(data.traefikConfig);
		console.log(error);
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
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Update traefik config</DialogTitle>
					<DialogDescription>Update the traefik config</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-update-server-traefik-config"
						onSubmit={form.handleSubmit(onSubmit)}
						className="w-full space-y-4 relative overflow-auto"
					>
						<div className="flex flex-col">
							<FormField
								control={form.control}
								name="traefikConfig"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel>Traefik config</FormLabel>
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
										<div className="flex justify-end absolute z-50 right-6 top-0">
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
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							disabled={canEdit}
							form="hook-form-update-server-traefik-config"
							type="submit"
						>
							Update
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
