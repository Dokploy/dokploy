import { Loader2, ShieldAlert } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, NumberInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import type { inferRouterOutputs } from "@trpc/server";

type TraefikPagesConfig =
	inferRouterOutputs<AppRouter>["traefikPages"]["getConfig"];
type TraefikPageStatus = keyof TraefikPagesConfig["pages"];

const STATUS_ORDER: TraefikPageStatus[] = ["401", "404", "503"];

const TOKEN_LIST = [
	"{{status}}",
	"{{status_text}}",
	"{{title}}",
	"{{subtitle}}",
	"{{message}}",
	"{{hint}}",
	"{{brand}}",
	"{{request_id}}",
	"{{timestamp}}",
	"{{host}}",
	"{{path}}",
	"{{method}}",
	"{{protocol}}",
];

const ColorField = ({
	label,
	value,
	onChange,
	description,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	description?: string;
}) => (
	<div className="flex flex-col gap-2">
		<div className="flex items-center justify-between gap-3">
			<div>
				<Label>{label}</Label>
				{description && (
					<p className="text-xs text-muted-foreground">{description}</p>
				)}
			</div>
			<input
				type="color"
				value={value || "#000000"}
				onChange={(event) => onChange(event.target.value)}
				className="h-9 w-12 rounded border border-input bg-input"
			/>
		</div>
		<Input value={value} onChange={(event) => onChange(event.target.value)} />
	</div>
);

interface Props {
	serverId?: string;
}

export const ShowTraefikPages = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const [draft, setDraft] = useState<TraefikPagesConfig | null>(null);
	const [activeStatus, setActiveStatus] =
		useState<TraefikPageStatus>("404");
	const [previewHtml, setPreviewHtml] = useState("");
	const [needsReload, setNeedsReload] = useState(false);
	const [saveWarnings, setSaveWarnings] = useState<string[]>([]);
	const [previewContext, setPreviewContext] = useState({
		host: "app.example.com",
		path: "/",
		requestId: "req_987654",
	});

	const {
		data,
		isLoading,
		isError,
		error,
	} = api.traefikPages.getConfig.useQuery(
		{ serverId },
		{
			retry: 2,
		},
	);

	const updateMutation = api.traefikPages.updateConfig.useMutation();
	const previewMutation = api.traefikPages.preview.useMutation();
	const reloadTraefik = api.settings.reloadTraefik.useMutation();

	useEffect(() => {
		if (data) {
			setDraft(data);
			setSaveWarnings([]);
			setNeedsReload(false);
		}
	}, [data]);

	const isDirty = useMemo(() => {
		if (!data || !draft) return false;
		return JSON.stringify(data) !== JSON.stringify(draft);
	}, [data, draft]);

	const updateDraft = (
		updater: (current: TraefikPagesConfig) => TraefikPagesConfig,
	) => {
		setDraft((current) => (current ? updater(current) : current));
	};

	const updatePage = (
		status: TraefikPageStatus,
		updater: (
			page: TraefikPagesConfig["pages"][TraefikPageStatus],
		) => TraefikPagesConfig["pages"][TraefikPageStatus],
	) => {
		updateDraft((current) => ({
			...current,
			pages: {
				...current.pages,
				[status]: updater(current.pages[status]),
			},
		}));
	};

	useEffect(() => {
		if (!draft) return;
		const handler = setTimeout(() => {
			previewMutation
				.mutateAsync({
					config: draft,
					status: activeStatus,
					context: {
						host: previewContext.host,
						path: previewContext.path,
						requestId: previewContext.requestId,
					},
				})
				.then((result) => setPreviewHtml(result.html))
				.catch(() => {
					setPreviewHtml("");
				});
		}, 300);
		return () => clearTimeout(handler);
	}, [draft, activeStatus, previewContext, previewMutation]);

	if (isLoading || !draft) {
		return (
			<Card className="bg-sidebar">
				<CardContent className="flex flex-col items-center justify-center gap-3 py-16">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
					<span className="text-sm text-muted-foreground">
						Loading Traefik Pages...
					</span>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="bg-sidebar p-2.5 rounded-xl">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader>
					<CardTitle className="text-xl flex items-center gap-2">
						<ShieldAlert className="size-5 text-muted-foreground" />
						Traefik Pages
					</CardTitle>
					<CardDescription>
						Design enterprise-grade 401, 404, and 503 pages for Traefik. Changes
						are applied instantly to the error page service, but updates to
						entrypoints require a Traefik reload.
					</CardDescription>
					<AlertBlock type="warning">
						This editor writes to Traefik configuration and serves pages publicly.
						Review content carefully before publishing.
					</AlertBlock>
				</CardHeader>
				<CardContent className="space-y-6 border-t pt-6">
					{isError && (
						<AlertBlock type="error">{error?.message}</AlertBlock>
					)}
					{saveWarnings.length > 0 && (
						<AlertBlock type="warning">
							{saveWarnings.join(" ")}
						</AlertBlock>
					)}
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="flex flex-wrap items-center gap-4">
							<div className="flex items-center gap-2">
								<Switch
									checked={draft.enabled}
									onCheckedChange={(checked) =>
										updateDraft((current) => ({
											...current,
											enabled: checked,
										}))
									}
								/>
								<Label>Enable Traefik error pages</Label>
							</div>
							<div className="flex items-center gap-2">
								<Badge variant={draft.enabled ? "green" : "secondary"}>
									{draft.enabled ? "Active" : "Disabled"}
								</Badge>
								{needsReload && (
									<Badge variant="outline">Reload required</Badge>
								)}
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="secondary"
								disabled={!isDirty}
								onClick={() => setDraft(data)}
							>
								Discard changes
							</Button>
							<Button
								disabled={!isDirty || updateMutation.isLoading}
								isLoading={updateMutation.isLoading}
								onClick={async () => {
									try {
										const result = await updateMutation.mutateAsync({
											serverId,
											config: draft,
										});
										await utils.traefikPages.getConfig.invalidate();
										setNeedsReload(result.needsReload);
										setSaveWarnings(result.warnings || []);
										toast.success("Traefik pages saved");
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to save Traefik pages",
										);
									}
								}}
							>
								Save changes
							</Button>
							<Button
								variant="outline"
								disabled={reloadTraefik.isLoading}
								onClick={async () => {
									try {
										await reloadTraefik.mutateAsync({ serverId });
										setNeedsReload(false);
										toast.success("Traefik reloaded");
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to reload Traefik",
										);
									}
								}}
							>
								Reload Traefik
							</Button>
						</div>
					</div>

					<div className="space-y-3">
						<Label>EntryPoints</Label>
						<div className="flex flex-wrap gap-4">
							{["web", "websecure"].map((entryPoint) => (
								<label
									key={entryPoint}
									className="flex items-center gap-2 text-sm"
								>
									<Checkbox
										checked={draft.entryPoints.includes(entryPoint)}
										onCheckedChange={(checked) => {
											updateDraft((current) => ({
												...current,
												entryPoints: checked
													? [...current.entryPoints, entryPoint]
													: current.entryPoints.filter(
															(item) => item !== entryPoint,
														),
											}));
										}}
									/>
									{entryPoint}
								</label>
							))}
						</div>
					</div>

					<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-6">
						<div className="space-y-6">
							<Card className="border-dashed">
								<CardHeader>
									<CardTitle className="text-base">Theme Studio</CardTitle>
									<CardDescription>
										Control the visual language across all error pages.
									</CardDescription>
								</CardHeader>
								<CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-3 md:col-span-2">
										<Label>Brand</Label>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
											<Input
												placeholder="Brand name"
												value={draft.theme.brandName}
												onChange={(event) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															brandName: event.target.value,
														},
													}))
												}
											/>
											<Input
												placeholder="Logo URL (optional)"
												value={draft.theme.logoUrl}
												onChange={(event) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															logoUrl: event.target.value,
														},
													}))
												}
											/>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
											<Input
												placeholder="Font family"
												value={draft.theme.fontFamily}
												onChange={(event) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															fontFamily: event.target.value,
														},
													}))
												}
											/>
											<Input
												placeholder="Font URL (optional)"
												value={draft.theme.fontUrl}
												onChange={(event) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															fontUrl: event.target.value,
														},
													}))
												}
											/>
										</div>
									</div>

									<ColorField
										label="Background"
										value={draft.theme.palette.background}
										onChange={(value) =>
											updateDraft((current) => ({
												...current,
												theme: {
													...current.theme,
													palette: {
														...current.theme.palette,
														background: value,
													},
												},
											}))
										}
									/>
									<ColorField
										label="Surface"
										value={draft.theme.palette.surface}
										onChange={(value) =>
											updateDraft((current) => ({
												...current,
												theme: {
													...current.theme,
													palette: {
														...current.theme.palette,
														surface: value,
													},
												},
											}))
										}
									/>
									<ColorField
										label="Card"
										value={draft.theme.palette.card}
										onChange={(value) =>
											updateDraft((current) => ({
												...current,
												theme: {
													...current.theme,
													palette: {
														...current.theme.palette,
														card: value,
													},
												},
											}))
										}
									/>
									<ColorField
										label="Text"
										value={draft.theme.palette.text}
										onChange={(value) =>
											updateDraft((current) => ({
												...current,
												theme: {
													...current.theme,
													palette: {
														...current.theme.palette,
														text: value,
													},
												},
											}))
										}
									/>
									<ColorField
										label="Muted"
										value={draft.theme.palette.muted}
										onChange={(value) =>
											updateDraft((current) => ({
												...current,
												theme: {
													...current.theme,
													palette: {
														...current.theme.palette,
														muted: value,
													},
												},
											}))
										}
									/>
									<ColorField
										label="Accent"
										value={draft.theme.palette.accent}
										onChange={(value) =>
											updateDraft((current) => ({
												...current,
												theme: {
													...current.theme,
													palette: {
														...current.theme.palette,
														accent: value,
													},
												},
											}))
										}
									/>
									<ColorField
										label="Border"
										value={draft.theme.palette.border}
										onChange={(value) =>
											updateDraft((current) => ({
												...current,
												theme: {
													...current.theme,
													palette: {
														...current.theme.palette,
														border: value,
													},
												},
											}))
										}
									/>

									<div className="space-y-3 md:col-span-2">
										<Label>Gradient</Label>
										<div className="flex items-center gap-2">
											<Switch
												checked={draft.theme.gradient.enabled}
												onCheckedChange={(checked) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															gradient: {
																...current.theme.gradient,
																enabled: checked,
															},
														},
													}))
												}
											/>
											<span className="text-sm text-muted-foreground">
												Enable gradient overlay
											</span>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
											<ColorField
												label="From"
												value={draft.theme.gradient.from}
												onChange={(value) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															gradient: {
																...current.theme.gradient,
																from: value,
															},
														},
													}))
												}
											/>
											<ColorField
												label="Via"
												value={draft.theme.gradient.via}
												onChange={(value) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															gradient: {
																...current.theme.gradient,
																via: value,
															},
														},
													}))
												}
											/>
											<ColorField
												label="To"
												value={draft.theme.gradient.to}
												onChange={(value) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															gradient: {
																...current.theme.gradient,
																to: value,
															},
														},
													}))
												}
											/>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
											<NumberInput
												value={draft.theme.gradient.angle}
												onChange={(event) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															gradient: {
																...current.theme.gradient,
																angle: Number(event.target.value || 0),
															},
														},
													}))
												}
												placeholder="Angle"
											/>
										</div>
									</div>

									<div className="space-y-3 md:col-span-2">
										<Label>Layout & effects</Label>
										<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
											<NumberInput
												value={draft.theme.layout.maxWidth}
												onChange={(event) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															layout: {
																...current.theme.layout,
																maxWidth: Number(event.target.value || 0),
															},
														},
													}))
												}
												placeholder="Max width"
											/>
											<NumberInput
												value={draft.theme.layout.padding}
												onChange={(event) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															layout: {
																...current.theme.layout,
																padding: Number(event.target.value || 0),
															},
														},
													}))
												}
												placeholder="Padding"
											/>
											<Select
												value={draft.theme.layout.alignment}
												onValueChange={(value) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															layout: {
																...current.theme.layout,
																alignment: value as "center" | "left",
															},
														},
													}))
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Alignment" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="center">Center</SelectItem>
													<SelectItem value="left">Left</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="flex flex-wrap gap-3">
											<label className="flex items-center gap-2 text-sm">
												<Switch
													checked={draft.theme.layout.card}
													onCheckedChange={(checked) =>
														updateDraft((current) => ({
															...current,
															theme: {
																...current.theme,
																layout: {
																	...current.theme.layout,
																	card: checked,
																},
															},
														}))
													}
												/>
												Card container
											</label>
											<label className="flex items-center gap-2 text-sm">
												<Switch
													checked={draft.theme.layout.glass}
													onCheckedChange={(checked) =>
														updateDraft((current) => ({
															...current,
															theme: {
																...current.theme,
																layout: {
																	...current.theme.layout,
																	glass: checked,
																},
															},
														}))
													}
												/>
												Glass blur
											</label>
											<label className="flex items-center gap-2 text-sm">
												<Switch
													checked={draft.theme.effects.glow}
													onCheckedChange={(checked) =>
														updateDraft((current) => ({
															...current,
															theme: {
																...current.theme,
																effects: {
																	...current.theme.effects,
																	glow: checked,
																},
															},
														}))
													}
												/>
												Glow
											</label>
											<label className="flex items-center gap-2 text-sm">
												<Switch
													checked={draft.theme.effects.grid}
													onCheckedChange={(checked) =>
														updateDraft((current) => ({
															...current,
															theme: {
																...current.theme,
																effects: {
																	...current.theme.effects,
																	grid: checked,
																},
															},
														}))
													}
												/>
												Grid
											</label>
											<label className="flex items-center gap-2 text-sm">
												<Switch
													checked={draft.theme.effects.noise}
													onCheckedChange={(checked) =>
														updateDraft((current) => ({
															...current,
															theme: {
																...current.theme,
																effects: {
																	...current.theme.effects,
																	noise: checked,
																},
															},
														}))
													}
												/>
												Noise
											</label>
										</div>
									</div>

									<div className="space-y-3 md:col-span-2">
										<Label>Buttons</Label>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
											<NumberInput
												value={draft.theme.buttons.radius}
												onChange={(event) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															buttons: {
																...current.theme.buttons,
																radius: Number(event.target.value || 0),
															},
														},
													}))
												}
												placeholder="Radius"
											/>
											<ColorField
												label="Primary background"
												value={draft.theme.buttons.primaryBackground}
												onChange={(value) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															buttons: {
																...current.theme.buttons,
																primaryBackground: value,
															},
														},
													}))
												}
											/>
											<ColorField
												label="Primary text"
												value={draft.theme.buttons.primaryText}
												onChange={(value) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															buttons: {
																...current.theme.buttons,
																primaryText: value,
															},
														},
													}))
												}
											/>
											<ColorField
												label="Secondary text"
												value={draft.theme.buttons.secondaryText}
												onChange={(value) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															buttons: {
																...current.theme.buttons,
																secondaryText: value,
															},
														},
													}))
												}
											/>
											<ColorField
												label="Secondary border"
												value={draft.theme.buttons.secondaryBorder}
												onChange={(value) =>
													updateDraft((current) => ({
														...current,
														theme: {
															...current.theme,
															buttons: {
																...current.theme.buttons,
																secondaryBorder: value,
															},
														},
													}))
												}
											/>
										</div>
									</div>
								</CardContent>
							</Card>

							<Card className="border-dashed">
								<CardHeader>
									<CardTitle className="text-base">
										Error Page Configuration
									</CardTitle>
									<CardDescription>
										Tailor each status page independently.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<Tabs
										value={activeStatus}
										onValueChange={(value) =>
											setActiveStatus(value as TraefikPageStatus)
										}
									>
										<TabsList className="flex flex-wrap">
											{STATUS_ORDER.map((status) => (
												<TabsTrigger key={status} value={status}>
													{status}
												</TabsTrigger>
											))}
										</TabsList>

										{STATUS_ORDER.map((status) => {
											const page = draft.pages[status];
											return (
												<TabsContent
													key={status}
													value={status}
													className="space-y-4"
												>
													<div className="flex flex-wrap items-center justify-between gap-3">
														<div className="flex items-center gap-2">
															<Switch
																checked={page.enabled}
																onCheckedChange={(checked) =>
																	updatePage(status, (current) => ({
																		...current,
																		enabled: checked,
																	}))
																}
															/>
															<Label>Enable {status} page</Label>
														</div>
														<Badge variant={page.enabled ? "green" : "secondary"}>
															{page.mode === "custom" ? "Custom" : "Builder"}
														</Badge>
													</div>

													<Tabs
														value={page.mode}
														onValueChange={(value) =>
															updatePage(status, (current) => ({
																...current,
																mode: value as "builder" | "custom",
															}))
														}
													>
														<TabsList>
															<TabsTrigger value="builder">Builder</TabsTrigger>
															<TabsTrigger value="custom">Custom code</TabsTrigger>
														</TabsList>
														<TabsContent value="builder" className="space-y-4">
															<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
																<div className="space-y-2">
																	<Label>Title</Label>
																	<Input
																		value={page.title}
																		onChange={(event) =>
																			updatePage(status, (current) => ({
																				...current,
																				title: event.target.value,
																			}))
																		}
																	/>
																</div>
																<div className="space-y-2">
																	<Label>Subtitle</Label>
																	<Input
																		value={page.subtitle}
																		onChange={(event) =>
																			updatePage(status, (current) => ({
																				...current,
																				subtitle: event.target.value,
																			}))
																		}
																	/>
																</div>
															</div>
															<div className="space-y-2">
																<Label>Message</Label>
																<Textarea
																	value={page.message}
																	onChange={(event) =>
																		updatePage(status, (current) => ({
																			...current,
																			message: event.target.value,
																		}))
																	}
																/>
															</div>
															<div className="space-y-2">
																<Label>Hint</Label>
																<Textarea
																	value={page.hint}
																	onChange={(event) =>
																		updatePage(status, (current) => ({
																			...current,
																			hint: event.target.value,
																		}))
																	}
																/>
															</div>

															<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
																<div className="space-y-2">
																	<Label>Primary action label</Label>
																	<Input
																		value={page.primaryAction.label}
																		onChange={(event) =>
																			updatePage(status, (current) => ({
																				...current,
																				primaryAction: {
																					...current.primaryAction,
																					label: event.target.value,
																				},
																			}))
																		}
																	/>
																	<Input
																		placeholder="Primary action URL"
																		value={page.primaryAction.href}
																		onChange={(event) =>
																			updatePage(status, (current) => ({
																				...current,
																				primaryAction: {
																					...current.primaryAction,
																					href: event.target.value,
																				},
																			}))
																		}
																	/>
																</div>
																<div className="space-y-2">
																	<Label>Secondary action label</Label>
																	<Input
																		value={page.secondaryAction.label}
																		onChange={(event) =>
																			updatePage(status, (current) => ({
																				...current,
																				secondaryAction: {
																					...current.secondaryAction,
																					label: event.target.value,
																				},
																			}))
																		}
																	/>
																	<Input
																		placeholder="Secondary action URL"
																		value={page.secondaryAction.href}
																		onChange={(event) =>
																			updatePage(status, (current) => ({
																				...current,
																				secondaryAction: {
																					...current.secondaryAction,
																					href: event.target.value,
																				},
																			}))
																		}
																	/>
																</div>
															</div>

															<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
																<label className="flex items-center gap-2 text-sm">
																	<Switch
																		checked={page.showRequestId}
																		onCheckedChange={(checked) =>
																			updatePage(status, (current) => ({
																				...current,
																				showRequestId: checked,
																			}))
																		}
																	/>
																	Show request ID
																</label>
																<label className="flex items-center gap-2 text-sm">
																	<Switch
																		checked={page.showTimestamp}
																		onCheckedChange={(checked) =>
																			updatePage(status, (current) => ({
																				...current,
																				showTimestamp: checked,
																			}))
																		}
																	/>
																	Show timestamp
																</label>
																<label className="flex items-center gap-2 text-sm">
																	<Switch
																		checked={page.showHost}
																		onCheckedChange={(checked) =>
																			updatePage(status, (current) => ({
																				...current,
																				showHost: checked,
																			}))
																		}
																	/>
																	Show host
																</label>
																<label className="flex items-center gap-2 text-sm">
																	<Switch
																		checked={page.showPath}
																		onCheckedChange={(checked) =>
																			updatePage(status, (current) => ({
																				...current,
																				showPath: checked,
																			}))
																		}
																	/>
																	Show path
																</label>
															</div>
														</TabsContent>

														<TabsContent value="custom" className="space-y-4">
															<AlertBlock type="warning">
																Use full HTML or body-only markup. Tokens are
																replaced server-side.
															</AlertBlock>
															<div className="space-y-2">
																<Label>HTML</Label>
																<CodeEditor
																	language="html"
																	lineWrapping
																	wrapperClassName="h-[260px] border rounded-md"
																	value={page.customHtml}
																	onChange={(value) =>
																		updatePage(status, (current) => ({
																			...current,
																			customHtml: value,
																		}))
																	}
																/>
															</div>
															<div className="space-y-2">
																<Label>CSS</Label>
																<CodeEditor
																	language="css"
																	lineWrapping
																	wrapperClassName="h-[200px] border rounded-md"
																	value={page.customCss}
																	onChange={(value) =>
																		updatePage(status, (current) => ({
																			...current,
																			customCss: value,
																		}))
																	}
																/>
															</div>
															<div className="flex flex-wrap gap-2">
																{TOKEN_LIST.map((token) => (
																	<Badge key={token} variant="secondary">
																		{token}
																	</Badge>
																))}
															</div>
														</TabsContent>
													</Tabs>
												</TabsContent>
											);
										})}
									</Tabs>
								</CardContent>
							</Card>
						</div>

						<div className="space-y-4">
							<Card className="border-dashed">
								<CardHeader>
									<CardTitle className="text-base">Live Preview</CardTitle>
									<CardDescription>
										This preview uses the same renderer that Traefik calls.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
										<div className="space-y-2">
											<Label>Host</Label>
											<Input
												value={previewContext.host}
												onChange={(event) =>
													setPreviewContext((current) => ({
														...current,
														host: event.target.value,
													}))
												}
											/>
										</div>
										<div className="space-y-2">
											<Label>Path</Label>
											<Input
												value={previewContext.path}
												onChange={(event) =>
													setPreviewContext((current) => ({
														...current,
														path: event.target.value,
													}))
												}
											/>
										</div>
										<div className="space-y-2">
											<Label>Request ID</Label>
											<Input
												value={previewContext.requestId}
												onChange={(event) =>
													setPreviewContext((current) => ({
														...current,
														requestId: event.target.value,
													}))
												}
											/>
										</div>
									</div>
									<div
										className={cn(
											"rounded-lg overflow-hidden border border-border bg-background",
											previewMutation.isLoading && "opacity-60",
										)}
									>
										{previewHtml ? (
											<iframe
												title="Traefik Pages Preview"
												srcDoc={previewHtml}
												className="w-full h-[520px]"
											/>
										) : (
											<div className="flex flex-col items-center justify-center h-[520px] text-muted-foreground text-sm">
												Preview is unavailable.
											</div>
										)}
									</div>
								</CardContent>
							</Card>
						</div>
					</div>
				</CardContent>
			</div>
		</Card>
	);
};
