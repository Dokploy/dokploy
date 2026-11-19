import type { SandboxTemplateName } from "@dokploy/server/db/schema";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Box, PlusIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const schema = z
	.object({
		name: z.string().max(64).optional(),
		source: z.enum(["template", "image"]),
		template: z.string().min(1),
		image: z.string().max(255).optional(),
		serverId: z.string().nullable(),
		cpu: z.number().min(0.1).max(64),
		memoryMb: z.number().int().min(64).max(262_144),
		timeoutMinutes: z.number().min(1).max(1440),
		networkMode: z.enum(["isolated", "internet"]),
		envVars: z.string().optional(),
		runtime: z
			.string()
			.max(64)
			.regex(/^([a-zA-Z0-9][a-zA-Z0-9_.-]*)?$/, "sandbox.errors.invalidRuntime")
			.optional(),
	})
	.refine((value) => value.source === "template" || !!value.image?.trim(), {
		message: "sandbox.errors.imageRequired",
		path: ["image"],
	});

type FormValues = z.infer<typeof schema>;

interface Props {
	serverId?: string;
}

export const AddSandbox = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const router = useRouter();
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: templates } = api.sandbox.templates.useQuery();
	const { mutateAsync, isPending, error } = api.sandbox.create.useMutation();

	const showLocalOption = !isCloud && !webServerSettings?.remoteServersOnly;

	const form = useForm<FormValues>({
		defaultValues: {
			name: "",
			source: "template",
			template: "python",
			image: "",
			serverId: serverId ?? null,
			cpu: 1,
			memoryMb: 512,
			timeoutMinutes: 5,
			networkMode: "isolated",
			envVars: "",
			runtime: "",
		},
		resolver: zodResolver(schema),
	});
	const source = form.watch("source");

	const onSubmit = async (values: FormValues) => {
		try {
			const sandbox = await mutateAsync({
				name: values.name?.trim() || undefined,
				template:
					values.source === "template"
						? (values.template as SandboxTemplateName)
						: undefined,
				image: values.source === "image" ? values.image?.trim() : undefined,
				serverId: values.serverId,
				cpu: values.cpu,
				memoryMb: values.memoryMb,
				timeoutMs: Math.round(values.timeoutMinutes * 60_000),
				networkMode: values.networkMode,
				envVars: values.envVars?.trim() || undefined,
				runtime: values.runtime?.trim() || undefined,
			});
			toast.success(t("sandbox.created"));
			await utils.sandbox.list.invalidate();
			setOpen(false);
			form.reset();
			router.push(`/dashboard/sandboxes/${sandbox.sandboxId}`);
		} catch {
			toast.error(t("sandbox.createError"));
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon className="size-4" />
					{t("sandbox.createSandbox")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl md:max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Box className="size-5 text-muted-foreground" />
						{t("sandbox.newSandbox")}
					</DialogTitle>
					<DialogDescription>
						{t("sandbox.newSandboxDescription")}
					</DialogDescription>
				</DialogHeader>
				{error && <AlertBlock type="error">{error.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="add-sandbox-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("sandbox.colName")}</FormLabel>
									<FormControl>
										<Input placeholder="my-sandbox" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="source"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("sandbox.colImage")}</FormLabel>
									<Tabs value={field.value} onValueChange={field.onChange}>
										<TabsList>
											<TabsTrigger value="template">
												{t("sandbox.tabTemplate")}
											</TabsTrigger>
											<TabsTrigger value="image">
												{t("sandbox.tabCustomImage")}
											</TabsTrigger>
										</TabsList>
									</Tabs>
								</FormItem>
							)}
						/>

						{source === "template" ? (
							<FormField
								control={form.control}
								name="template"
								render={({ field }) => (
									<FormItem>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger>
												<SelectValue
													placeholder={t("sandbox.selectTemplate")}
												/>
											</SelectTrigger>
											<SelectContent>
												{(templates ?? []).map((template) => (
													<SelectItem key={template.name} value={template.name}>
														<span className="capitalize">{template.name}</span>
														<span className="text-muted-foreground">
															{" "}
															· {template.description}
														</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						) : (
							<FormField
								control={form.control}
								name="image"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<Input placeholder="alpine:3.20" {...field} />
										</FormControl>
										<FormDescription>
											{t("sandbox.imageDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{(servers?.length ?? 0) > 0 && (
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("sandbox.labelServer")}</FormLabel>
										<Select
											value={field.value ?? "dokploy"}
											onValueChange={(value) =>
												field.onChange(value === "dokploy" ? null : value)
											}
										>
											<SelectTrigger>
												<SelectValue placeholder={t("sandbox.selectServer")} />
											</SelectTrigger>
											<SelectContent>
												{showLocalOption && (
													<SelectItem value="dokploy">
														{t("sandbox.dokployServer")}
													</SelectItem>
												)}
												{servers?.map((server) => (
													<SelectItem
														key={server.serverId}
														value={server.serverId}
													>
														{server.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<FormField
								control={form.control}
								name="cpu"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("sandbox.labelCpuCores")}</FormLabel>
										<FormControl>
											<Input
												type="number"
												step="0.1"
												min={0.1}
												{...field}
												onChange={(event) =>
													field.onChange(event.target.valueAsNumber)
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="memoryMb"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("sandbox.labelMemory")}</FormLabel>
										<FormControl>
											<Input
												type="number"
												step="64"
												min={64}
												{...field}
												onChange={(event) =>
													field.onChange(event.target.valueAsNumber)
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="timeoutMinutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("sandbox.labelTimeout")}</FormLabel>
										<FormControl>
											<Input
												type="number"
												step="1"
												min={1}
												{...field}
												onChange={(event) =>
													field.onChange(event.target.valueAsNumber)
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="networkMode"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("sandbox.labelNetwork")}</FormLabel>
									<Select value={field.value} onValueChange={field.onChange}>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="isolated">
												{t("sandbox.networkIsolated")}
											</SelectItem>
											<SelectItem value="internet">
												{t("sandbox.networkInternet")}
											</SelectItem>
										</SelectContent>
									</Select>
									<FormDescription>
										{t("sandbox.networkDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="runtime"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("sandbox.labelRuntime")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("sandbox.runtimePlaceholder")}
											className="font-mono"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("sandbox.runtimeDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="envVars"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("sandbox.labelEnvVars")}</FormLabel>
									<FormControl>
										<Textarea
											placeholder={"KEY=value\nOTHER=value"}
											className="font-mono min-h-[80px]"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>
				</Form>
				<DialogFooter>
					<Button
						type="submit"
						form="add-sandbox-form"
						isLoading={isPending}
						disabled={isPending}
					>
						{t("sandbox.create")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
