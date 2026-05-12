import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Code2, FileInput, Globe2, HardDrive, HelpCircle } from "lucide-react";
import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

const AddImportSchema = z.object({
	name: z.string().min(1, { message: "Name is required" }),
	appName: z
		.string()
		.min(1, { message: "App name is required" })
		.regex(APP_NAME_REGEX, { message: APP_NAME_MESSAGE }),
	base64: z.string().min(1, { message: "Base64 content is required" }),
	serverId: z.string().optional(),
});

type AddImport = z.infer<typeof AddImportSchema>;

type TemplateInfo = {
	compose: string;
	template: {
		domains: Array<{
			serviceName: string;
			port: number;
			path?: string;
			host?: string;
		}>;
		envs: string[];
		mounts: Array<{ filePath: string; content: string }>;
	};
};

interface Props {
	environmentId: string;
	projectName?: string;
}

export const AddImport = ({ environmentId, projectName }: Props) => {
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [mountOpen, setMountOpen] = useState(false);
	const [selectedMount, setSelectedMount] = useState<{
		filePath: string;
		content: string;
	} | null>(null);
	const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);

	const slug = slugify(projectName);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const shouldShowServerDropdown = !!(servers && servers.length > 0);

	const { mutateAsync: previewTemplate, isPending: isProcessing } =
		api.compose.previewTemplate.useMutation();
	const { mutateAsync: createCompose, isPending: isCreating } =
		api.compose.create.useMutation();
	const { mutateAsync: importCompose, isPending: isImporting } =
		api.compose.import.useMutation();

	const form = useForm<AddImport>({
		defaultValues: { name: "", appName: `${slug}-`, base64: "" },
		resolver: zodResolver(AddImportSchema),
	});

	const resetAll = () => {
		form.reset({ name: "", appName: `${slug}-`, base64: "" });
		setTemplateInfo(null);
		setPreviewOpen(false);
		setMountOpen(false);
		setSelectedMount(null);
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) resetAll();
		setVisible(open);
	};

	const handleLoad = async (data: AddImport) => {
		try {
			const result = await previewTemplate({
				appName: data.appName,
				base64: data.base64.trim(),
				serverId: data.serverId === "dokploy" ? undefined : data.serverId,
			});
			setTemplateInfo(result);
			setPreviewOpen(true);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error processing template",
			);
		}
	};

	const handleImport = async () => {
		const data = form.getValues();
		try {
			const compose = await createCompose({
				name: data.name,
				appName: data.appName,
				environmentId,
				composeType: "docker-compose",
				serverId: data.serverId === "dokploy" ? undefined : data.serverId,
			});
			await importCompose({
				composeId: compose.composeId,
				base64: data.base64.trim(),
			});
			toast.success("Compose imported successfully");
			await utils.environment.one.invalidate({ environmentId });
			resetAll();
			setVisible(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error importing compose",
			);
		}
	};

	const handleCancelPreview = () => {
		setPreviewOpen(false);
		setTemplateInfo(null);
	};

	return (
		<>
			<Dialog open={visible} onOpenChange={handleOpenChange}>
				<DialogTrigger className="w-full">
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<FileInput className="size-4 text-muted-foreground" />
						<span>Import</span>
					</DropdownMenuItem>
				</DialogTrigger>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Import Compose</DialogTitle>
						<DialogDescription>
							Paste a base64-encoded compose export to preview and import it
						</DialogDescription>
					</DialogHeader>

					<Form {...form}>
						<form
							id="hook-form-import"
							onSubmit={form.handleSubmit(handleLoad)}
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
												placeholder="My App"
												{...field}
												onChange={(e) => {
													const val = e.target.value || "";
													form.setValue(
														"appName",
														`${slug}-${slugify(val.trim())}`,
													);
													field.onChange(val);
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
															{!isCloud ? "(Optional)" : ""}
															<HelpCircle className="size-4 text-muted-foreground" />
														</FormLabel>
													</TooltipTrigger>
													<TooltipContent
														className="z-[999] w-[300px]"
														align="start"
														side="top"
													>
														<span>
															If no server is selected, the compose will be
															deployed on the server where the user is logged in.
														</span>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
											<Select
												onValueChange={field.onChange}
												defaultValue={
													field.value || (!isCloud ? "dokploy" : undefined)
												}
											>
												<SelectTrigger>
													<SelectValue
														placeholder={
															!isCloud ? "Dokploy" : "Select a Server"
														}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{!isCloud && (
															<SelectItem value="dokploy">
																<span className="flex items-center gap-2 justify-between w-full">
																	<span>Dokploy</span>
																	<span className="text-muted-foreground text-xs self-center">
																		Default
																	</span>
																</span>
															</SelectItem>
														)}
														{servers?.map((server) => (
															<SelectItem
																key={server.serverId}
																value={server.serverId}
															>
																<span className="flex items-center gap-2 justify-between w-full">
																	<span>{server.name}</span>
																	<span className="text-muted-foreground text-xs self-center">
																		{server.ipAddress}
																	</span>
																</span>
															</SelectItem>
														))}
														<SelectLabel>
															Servers (
															{(servers?.length ?? 0) + (!isCloud ? 1 : 0)})
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
											<Input placeholder="my-app" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="base64"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Configuration (Base64)</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Paste your base64-encoded compose export here..."
												className="font-mono resize-none h-32"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="flex justify-end">
								<Button
									type="submit"
									variant="outline"
									isLoading={isCreating || isProcessing}
								>
									Load
								</Button>
							</div>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			{/* Preview modal */}
			<Dialog open={previewOpen} onOpenChange={(open) => !open && handleCancelPreview()}>
				<DialogContent className="max-w-[60vw]">
					<DialogHeader>
						<DialogTitle className="text-2xl font-bold">
							Template Information
						</DialogTitle>
						<DialogDescription className="space-y-2">
							<p>Review the template information before importing</p>
							<AlertBlock type="warning">
								Warning: This will remove all existing environment variables,
								mounts, and domains from this service.
							</AlertBlock>
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-6">
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Code2 className="h-5 w-5 text-primary" />
								<h3 className="text-lg font-semibold">Docker Compose</h3>
							</div>
							<CodeEditor
								language="yaml"
								value={templateInfo?.compose || ""}
								className="font-mono"
								readOnly
							/>
						</div>

						{templateInfo?.template.domains &&
							templateInfo.template.domains.length > 0 && (
								<>
									<Separator />
									<div className="space-y-4">
										<div className="flex items-center gap-2">
											<Globe2 className="h-5 w-5 text-primary" />
											<h3 className="text-lg font-semibold">Domains</h3>
										</div>
										<div className="grid grid-cols-1 gap-3">
											{templateInfo.template.domains.map((domain, index) => (
												<div
													key={index}
													className="rounded-lg border bg-card p-3 text-card-foreground shadow-sm"
												>
													<div className="font-medium">{domain.serviceName}</div>
													<div className="text-sm text-muted-foreground space-y-1">
														<div>Port: {domain.port}</div>
														{domain.host && <div>Host: {domain.host}</div>}
														{domain.path && <div>Path: {domain.path}</div>}
													</div>
												</div>
											))}
										</div>
									</div>
								</>
							)}

						{templateInfo?.template.envs &&
							templateInfo.template.envs.length > 0 && (
								<>
									<Separator />
									<div className="space-y-4">
										<div className="flex items-center gap-2">
											<Code2 className="h-5 w-5 text-primary" />
											<h3 className="text-lg font-semibold">
												Environment Variables
											</h3>
										</div>
										<div className="grid grid-cols-1 gap-2">
											{templateInfo.template.envs.map((env, index) => (
												<div
													key={index}
													className="rounded-lg truncate border bg-card p-2 font-mono text-sm"
												>
													{env}
												</div>
											))}
										</div>
									</div>
								</>
							)}

						{templateInfo?.template.mounts &&
							templateInfo.template.mounts.length > 0 && (
								<>
									<Separator />
									<div className="space-y-4">
										<div className="flex items-center gap-2">
											<HardDrive className="h-5 w-5 text-primary" />
											<h3 className="text-lg font-semibold">Mounts</h3>
										</div>
										<div className="grid grid-cols-1 gap-2">
											{templateInfo.template.mounts.map((mount, index) => (
												<div
													key={index}
													className="rounded-lg border bg-card p-2 font-mono text-sm hover:bg-accent cursor-pointer transition-colors"
													onClick={() => {
														setSelectedMount(mount);
														setMountOpen(true);
													}}
												>
													{mount.filePath}
												</div>
											))}
										</div>
									</div>
								</>
							)}
					</div>

					<div className="flex justify-end gap-2 pt-4">
						<Button variant="outline" onClick={handleCancelPreview}>
							Cancel
						</Button>
						<Button isLoading={isImporting} onClick={handleImport}>
							Import
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Mount content modal */}
			<Dialog open={mountOpen} onOpenChange={setMountOpen}>
				<DialogContent className="max-w-[50vw]">
					<DialogHeader>
						<DialogTitle className="text-xl font-bold">
							{selectedMount?.filePath}
						</DialogTitle>
						<DialogDescription>Mount File Content</DialogDescription>
					</DialogHeader>
					<ScrollArea className="h-[45vh] pr-4">
						<CodeEditor
							language="yaml"
							value={selectedMount?.content || ""}
							className="font-mono"
							readOnly
						/>
					</ScrollArea>
					<div className="flex justify-end gap-2 pt-4">
						<Button onClick={() => setMountOpen(false)}>Close</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
};
