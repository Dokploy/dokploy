import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { GlobeIcon, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { slugify } from "@/lib/slug";
import { api } from "@/utils/api";
import { APP_NAME_MESSAGE, APP_NAME_REGEX } from "@/utils/schema";

const addExternalUpstreamSchema = z.object({
	name: z.string().min(1, { message: "Name is required" }),
	appName: z
		.string()
		.min(1, { message: "App name is required" })
		.regex(APP_NAME_REGEX, { message: APP_NAME_MESSAGE }),
	description: z.string().optional(),
	targetUrl: z.string().url("Target URL must be a valid URL"),
	passHostHeader: z.boolean(),
	serverId: z.string().optional(),
});

type AddExternalUpstreamForm = z.infer<typeof addExternalUpstreamSchema>;

interface Props {
	environmentId: string;
	projectName?: string;
}

export const AddExternalUpstream = ({
	environmentId,
	projectName,
}: Props) => {
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);
	const slug = slugify(projectName);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const showLocalOption = !isCloud && !webServerSettings?.remoteServersOnly;
	const shouldShowServerDropdown = !!servers && servers.length > 0;

	const { mutateAsync, isPending, error, isError } =
		api.externalUpstream.create.useMutation();

	const form = useForm<AddExternalUpstreamForm>({
		defaultValues: {
			name: "",
			appName: `${slug}-`,
			description: "",
			targetUrl: "http://",
			passHostHeader: true,
		},
		resolver: zodResolver(addExternalUpstreamSchema),
	});

	const onSubmit = async (data: AddExternalUpstreamForm) => {
		await mutateAsync({
			...data,
			environmentId,
			serverId: data.serverId === "dokploy" ? undefined : data.serverId,
		})
			.then(async () => {
				toast.success("External Upstream created");
				form.reset();
				setVisible(false);
				await utils.environment.one.invalidate({ environmentId });
				await utils.project.all.invalidate();
			})
			.catch(() => {
				toast.error("Error creating the external upstream");
			});
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<GlobeIcon className="size-4 text-muted-foreground" />
					<span>External Upstream</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Create</DialogTitle>
					<DialogDescription>
						Create a reverse proxy entry for a service hosted outside Dokploy
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input
											placeholder="Home Assistant"
											{...field}
											onChange={(e) => {
												const value = e.target.value || "";
												form.setValue(
													"appName",
													`${slug}-${slugify(value.trim())}`,
												);
												field.onChange(value);
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{shouldShowServerDropdown && (
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<FormLabel className="break-all w-fit flex flex-row gap-1 items-center">
														Select a Server{" "}
														{showLocalOption ? "(Optional)" : ""}
														<HelpCircle className="size-4 text-muted-foreground" />
													</FormLabel>
												</TooltipTrigger>
												<TooltipContent
													className="z-999 w-[300px]"
													align="start"
													side="top"
												>
													<span>
														The service will be exposed by Traefik running on
														this server.
													</span>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
										<Select
											onValueChange={field.onChange}
											defaultValue={
												field.value || (showLocalOption ? "dokploy" : undefined)
											}
										>
											<SelectTrigger>
												<SelectValue
													placeholder={
														showLocalOption ? "Dokploy" : "Select a Server"
													}
												/>
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{showLocalOption && (
														<SelectItem value="dokploy">Dokploy</SelectItem>
													)}
													{servers?.map((server) => (
														<SelectItem
															key={server.serverId}
															value={server.serverId}
														>
															{server.name}
														</SelectItem>
													))}
													<SelectLabel>
														Servers (
														{servers?.length + (showLocalOption ? 1 : 0)})
													</SelectLabel>
												</SelectGroup>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<FormField
							control={form.control}
							name="appName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>App Name</FormLabel>
									<FormControl>
										<Input placeholder={`${slug}-home-assistant`} {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="targetUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Target URL</FormLabel>
									<FormControl>
										<Input placeholder="http://192.168.1.20:8123" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											rows={3}
											placeholder="Internal home automation UI"
											{...field}
											value={field.value || ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="passHostHeader"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-1">
										<FormLabel>Pass Host Header</FormLabel>
										<p className="text-sm text-muted-foreground">
											Forward the original host header to the upstream service
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
					</form>
				</Form>
				<DialogFooter>
					<Button form="hook-form" type="submit" isLoading={isPending}>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
