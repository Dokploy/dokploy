import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const schema = z.object({
	env: z.string(),
});

type Schema = z.infer<typeof schema>;

interface Props {
	children?: React.ReactNode;
	serverId?: string;
}

export const EditTraefikEnv = ({ children, serverId }: Props) => {
	const [canEdit, setCanEdit] = useState(true);
	const { t } = useTranslation("common");

	const { data } = api.settings.readTraefikEnv.useQuery({
		serverId,
	});

	const { mutateAsync, isLoading, error, isError } =
		api.settings.writeTraefikEnv.useMutation();

	const form = useForm<Schema>({
		defaultValues: {
			env: data || "",
		},
		disabled: canEdit,
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				env: data || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			env: data.env,
			serverId,
		})
			.then(async () => {
				toast.success(t("settings.server.webServer.traefik.env.update.success"));
			})
			.catch(() => {
				toast.error(t("settings.server.webServer.traefik.env.update.error"));
			});
	};

	// Add keyboard shortcut for Ctrl+S/Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "s" && !isLoading && !canEdit) {
				e.preventDefault();
				form.handleSubmit(onSubmit)();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [form, onSubmit, isLoading, canEdit]);

	return (
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>
						{t("settings.server.webServer.traefik.env.title")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.server.webServer.traefik.env.description")}
					</DialogDescription>
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
								name="env"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel>
											{t("settings.server.webServer.traefik.env.label")}
										</FormLabel>
										<FormControl>
											<CodeEditor
												language="properties"
												wrapperClassName="h-[35rem] font-mono"
												placeholder={`TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_ACME_EMAIL=test@localhost.com
TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_STORAGE=/etc/dokploy/traefik/dynamic/acme.json
TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_HTTP_CHALLENGE=true
TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_HTTP_CHALLENGE_PRETTY=true
TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_HTTP_CHALLENGE_ENTRYPOINT=web
TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_HTTP_CHALLENGE_DNS_CHALLENGE=true
TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_HTTP_CHALLENGE_DNS_PROVIDER=cloudflare
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
							disabled={canEdit || isLoading}
							form="hook-form-update-server-traefik-config"
							type="submit"
						>
							{t("button.update")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
