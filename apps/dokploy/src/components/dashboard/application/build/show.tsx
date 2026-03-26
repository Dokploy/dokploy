import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Cog } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

// Railpack versions from https://github.com/railwayapp/railpack/releases
export const RAILPACK_VERSIONS = [
	"0.15.4",
	"0.15.3",
	"0.15.2",
	"0.15.1",
	"0.15.0",
	"0.14.0",
	"0.13.0",
	"0.12.0",
	"0.11.0",
	"0.10.0",
	"0.9.2",
	"0.9.1",
	"0.9.0",
	"0.8.0",
	"0.7.0",
	"0.6.0",
	"0.5.0",
	"0.4.0",
	"0.3.0",
	"0.2.2",
] as const;

export enum BuildType {
	dockerfile = "dockerfile",
	heroku_buildpacks = "heroku_buildpacks",
	paketo_buildpacks = "paketo_buildpacks",
	nixpacks = "nixpacks",
	static = "static",
	railpack = "railpack",
}

const BUILD_TYPE_ORDER: BuildType[] = [
	BuildType.dockerfile,
	BuildType.railpack,
	BuildType.nixpacks,
	BuildType.heroku_buildpacks,
	BuildType.paketo_buildpacks,
	BuildType.static,
];

const mySchema = z.discriminatedUnion("buildType", [
	z.object({
		buildType: z.literal(BuildType.dockerfile),
		dockerfile: z.string().nullable().default(""),
		dockerContextPath: z.string().nullable().default(""),
		dockerBuildStage: z.string().nullable().default(""),
	}),
	z.object({
		buildType: z.literal(BuildType.heroku_buildpacks),
		herokuVersion: z.string().nullable().default(""),
	}),
	z.object({
		buildType: z.literal(BuildType.paketo_buildpacks),
	}),
	z.object({
		buildType: z.literal(BuildType.nixpacks),
		publishDirectory: z.string().optional(),
	}),
	z.object({
		buildType: z.literal(BuildType.railpack),
		railpackVersion: z.string().nullable().default("0.15.4"),
	}),
	z.object({
		buildType: z.literal(BuildType.static),
		isStaticSpa: z.boolean().default(false),
	}),
]);

type AddTemplate = z.infer<typeof mySchema>;

interface Props {
	applicationId: string;
}

interface ApplicationData {
	buildType: BuildType;
	dockerfile?: string | null;
	dockerContextPath?: string | null;
	dockerBuildStage?: string | null;
	herokuVersion?: string | null;
	publishDirectory?: string | null;
	isStaticSpa?: boolean | null;
	railpackVersion?: string | null | undefined;
}

function isValidBuildType(value: string): value is BuildType {
	return Object.values(BuildType).includes(value as BuildType);
}

const resetData = (data: ApplicationData): AddTemplate => {
	switch (data.buildType) {
		case BuildType.dockerfile:
			return {
				buildType: BuildType.dockerfile,
				dockerfile: data.dockerfile || "",
				dockerContextPath: data.dockerContextPath || "",
				dockerBuildStage: data.dockerBuildStage || "",
			};
		case BuildType.heroku_buildpacks:
			return {
				buildType: BuildType.heroku_buildpacks,
				herokuVersion: data.herokuVersion || "",
			};
		case BuildType.nixpacks:
			return {
				buildType: BuildType.nixpacks,
				publishDirectory: data.publishDirectory || undefined,
			};
		case BuildType.paketo_buildpacks:
			return {
				buildType: BuildType.paketo_buildpacks,
			};
		case BuildType.static:
			return {
				buildType: BuildType.static,
				isStaticSpa: data.isStaticSpa ?? false,
			};
		case BuildType.railpack:
			return {
				buildType: BuildType.railpack,
				railpackVersion: data.railpackVersion || null,
			};
		default: {
			const buildType = data.buildType as BuildType;
			return {
				buildType,
			} as AddTemplate;
		}
	}
};

export const ShowBuildChooseForm = ({ applicationId }: Props) => {
	const t = useTranslations("applicationBuild");
	const tCommon = useTranslations("common");
	const buildTypeDisplayMap = useMemo(
		(): Record<BuildType, string> => ({
			[BuildType.dockerfile]: t("buildTypes.dockerfile"),
			[BuildType.railpack]: t("buildTypes.railpack"),
			[BuildType.nixpacks]: t("buildTypes.nixpacks"),
			[BuildType.heroku_buildpacks]: t("buildTypes.heroku_buildpacks"),
			[BuildType.paketo_buildpacks]: t("buildTypes.paketo_buildpacks"),
			[BuildType.static]: t("buildTypes.static"),
		}),
		[t],
	);

	const { mutateAsync, isPending } =
		api.application.saveBuildType.useMutation();
	const { data, refetch } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);

	const form = useForm({
		defaultValues: {
			buildType: BuildType.nixpacks,
		},
		resolver: zodResolver(mySchema),
	});

	const buildType = form.watch("buildType");
	const railpackVersion = form.watch("railpackVersion");
	const [isManualRailpackVersion, setIsManualRailpackVersion] = useState(false);

	useEffect(() => {
		if (data) {
			const typedData: ApplicationData = {
				...data,
				buildType: isValidBuildType(data.buildType)
					? (data.buildType as BuildType)
					: BuildType.nixpacks, // fallback
			};

			form.reset(resetData(typedData));

			// Check if railpack version is manual (not in the predefined list)
			if (
				data.railpackVersion &&
				!RAILPACK_VERSIONS.includes(data.railpackVersion as any)
			) {
				setIsManualRailpackVersion(true);
			}
		}
	}, [data, form]);

	// Hide builder section when Docker provider is selected
	if (data?.sourceType === "docker") {
		return null;
	}

	const onSubmit = async (data: AddTemplate) => {
		await mutateAsync({
			applicationId,
			buildType: data.buildType,
			publishDirectory:
				data.buildType === BuildType.nixpacks ? data.publishDirectory : null,
			dockerfile:
				data.buildType === BuildType.dockerfile ? data.dockerfile : null,
			dockerContextPath:
				data.buildType === BuildType.dockerfile ? data.dockerContextPath : null,
			dockerBuildStage:
				data.buildType === BuildType.dockerfile ? data.dockerBuildStage : null,
			herokuVersion:
				data.buildType === BuildType.heroku_buildpacks
					? data.herokuVersion
					: null,
			isStaticSpa:
				data.buildType === BuildType.static ? data.isStaticSpa : null,
			railpackVersion:
				data.buildType === BuildType.railpack
					? data.railpackVersion || "0.15.4"
					: null,
		})
			.then(async () => {
				toast.success(t("toast.success"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("toast.error"));
			});
	};

	return (
		<Card className="group relative w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<span className="flex flex-col space-y-0.5">{t("title")}</span>
						<p className="flex items-center text-sm font-normal text-muted-foreground">
							{t("subtitle")}
						</p>
					</div>
					<div className="hidden space-y-1 text-sm font-normal md:block">
						<Cog className="size-6 text-muted-foreground" />
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<AlertBlock>
						{t.rich("alertRich", {
							guide: (chunks) => (
								<a
									href="https://docs.dokploy.com/docs/core/applications/going-production"
									target="_blank"
									rel="noreferrer"
									className="font-medium underline underline-offset-4"
								>
									{chunks}
								</a>
							),
						})}
					</AlertBlock>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 p-2"
					>
						<FormField
							control={form.control}
							name="buildType"
							defaultValue={form.control._defaultValues.buildType}
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel>{t("buildTypeLabel")}</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											value={field.value}
											className="flex flex-col space-y-1"
										>
											{BUILD_TYPE_ORDER.map((value) => (
												<FormItem
													key={value}
													className="flex items-center space-x-3 space-y-0"
												>
													<FormControl>
														<RadioGroupItem value={value} />
													</FormControl>
													<FormLabel className="font-normal">
														{buildTypeDisplayMap[value]}
														{value === BuildType.railpack && (
															<Badge className="ml-2 px-1 text-xs">
																{t("badgeNew")}
															</Badge>
														)}
													</FormLabel>
												</FormItem>
											))}
										</RadioGroup>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{buildType === BuildType.heroku_buildpacks && (
							<FormField
								control={form.control}
								name="herokuVersion"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("heroku.label")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("heroku.placeholder")}
												{...field}
												value={field.value ?? ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{buildType === BuildType.dockerfile && (
							<>
								<FormField
									control={form.control}
									name="dockerfile"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("dockerfile.dockerFileLabel")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("dockerfile.dockerFilePlaceholder")}
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="dockerContextPath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("dockerfile.contextPathLabel")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("dockerfile.contextPathPlaceholder")}
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="dockerBuildStage"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>{t("dockerfile.buildStageLabel")}</FormLabel>
												<FormDescription>
													{t("dockerfile.buildStageDesc")}
												</FormDescription>
											</div>
											<FormControl>
												<Input
													placeholder={t("dockerfile.buildStagePlaceholder")}
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</>
						)}
						{buildType === BuildType.nixpacks && (
							<FormField
								control={form.control}
								name="publishDirectory"
								render={({ field }) => (
									<FormItem>
										<div className="space-y-0.5">
											<FormLabel>{t("nixpacks.publishDirLabel")}</FormLabel>
											<FormDescription>
												{t("nixpacks.publishDirDesc")}
											</FormDescription>
										</div>
										<FormControl>
											<Input
												placeholder={t("nixpacks.publishDirPlaceholder")}
												{...field}
												value={field.value ?? ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{buildType === BuildType.static && (
							<FormField
								control={form.control}
								name="isStaticSpa"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<div className="flex items-center gap-x-2 p-2">
												<Checkbox
													id="checkboxIsStaticSpa"
													value={String(field.value)}
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
												<FormLabel htmlFor="checkboxIsStaticSpa">
													{t("static.spaLabel")}
												</FormLabel>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{buildType === BuildType.railpack && (
							<>
								<FormField
									control={form.control}
									name="railpackVersion"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("railpack.versionLabel")}</FormLabel>
											<FormControl>
												{isManualRailpackVersion ? (
													<div className="space-y-2">
														<Input
															placeholder={t("railpack.placeholderManual")}
															{...field}
															value={field.value ?? ""}
														/>
														<Button
															type="button"
															variant="outline"
															size="sm"
															onClick={() => {
																setIsManualRailpackVersion(false);
																field.onChange("0.15.4");
															}}
														>
															{t("railpack.usePredefined")}
														</Button>
													</div>
												) : (
													<Select
														onValueChange={(value) => {
															if (value === "manual") {
																setIsManualRailpackVersion(true);
																field.onChange("");
															} else {
																field.onChange(value);
															}
														}}
														value={field.value ?? "0.15.4"}
													>
														<SelectTrigger>
															<SelectValue
																placeholder={t("railpack.selectPlaceholder")}
															/>
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="manual">
																<span className="font-medium">
																	{t("railpack.manualOption")}
																</span>
															</SelectItem>
															{RAILPACK_VERSIONS.map((version) => (
																<SelectItem key={version} value={version}>
																	{t("railpack.versionPrefix")}
																	{version}
																	{version === "0.15.4" && (
																		<Badge
																			variant="secondary"
																			className="ml-2 px-1 text-xs"
																		>
																			{t("badgeLatest")}
																		</Badge>
																	)}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												)}
											</FormControl>
											<FormDescription>
												{t.rich("railpack.descRich", {
													releases: (chunks) => (
														<a
															href="https://github.com/railwayapp/railpack/releases"
															target="_blank"
															rel="noreferrer"
															className="text-primary underline underline-offset-4"
														>
															{chunks}
														</a>
													),
												})}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}
						<div className="flex w-full justify-end">
							<Button isLoading={isPending} type="submit">
								{tCommon("save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
