import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Cog } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
	"0.39.0",
	"0.38.0",
	"0.37.1",
	"0.37.0",
	"0.36.4",
	"0.36.3",
	"0.36.2",
	"0.36.1",
	"0.36.0",
	"0.35.0",
	"0.34.0",
	"0.33.0",
	"0.32.0",
	"0.31.2",
	"0.31.1",
	"0.31.0",
	"0.30.1",
	"0.30.0",
	"0.29.0",
	"0.28.0",
	"0.27.2",
	"0.27.1",
	"0.27.0",
	"0.26.1",
	"0.26.0",
	"0.25.0",
	"0.24.0",
	"0.23.0",
	"0.22.2",
	"0.22.1",
	"0.22.0",
	"0.21.0",
	"0.20.0",
	"0.19.0",
	"0.18.0",
	"0.17.2",
	"0.17.1",
	"0.17.0",
	"0.16.0",
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
	"0.7.2",
	"0.7.1",
	"0.7.0",
	"0.6.1",
	"0.6.0",
	"0.5.1",
	"0.5.0",
	"0.4.0",
	"0.3.0",
	"0.2.3",
	"0.2.2",
	"0.2.1",
	"0.2.0",
	"0.1.2",
	"0.1.1",
	"0.1.0",
] as const;

export enum BuildType {
	dockerfile = "dockerfile",
	heroku_buildpacks = "heroku_buildpacks",
	paketo_buildpacks = "paketo_buildpacks",
	nixpacks = "nixpacks",
	static = "static",
	railpack = "railpack",
}

const buildTypeDisplayMap: Record<BuildType, string> = {
	[BuildType.dockerfile]: "Dockerfile",
	[BuildType.railpack]: "Railpack",
	[BuildType.nixpacks]: "Nixpacks",
	[BuildType.heroku_buildpacks]: "Heroku Buildpacks",
	[BuildType.paketo_buildpacks]: "Paketo Buildpacks",
	[BuildType.static]: "Static",
};

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
		isStaticSpa: z.boolean().default(false),
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
				isStaticSpa: data.isStaticSpa ?? false,
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
	const { t } = useTranslation();
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
	const publishDirectory = form.watch("publishDirectory");
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
				data.buildType === BuildType.static ||
				data.buildType === BuildType.nixpacks
					? data.isStaticSpa
					: null,
			railpackVersion:
				data.buildType === BuildType.railpack
					? data.railpackVersion || "0.15.4"
					: null,
		})
			.then(async () => {
				toast.success(t("application.build.saved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.build.saveError"));
			});
	};

	return (
		<Card className="group relative w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<span className="flex flex-col space-y-0.5">
							{t("application.build.title")}
						</span>
						<p className="flex items-center text-sm font-normal text-muted-foreground">
							{t("application.build.description")}
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
						{t("application.build.resourcesWarning")}{" "}
						<a
							href="https://docs.dokploy.com/docs/core/applications/going-production"
							target="_blank"
							rel="noreferrer"
							className="font-medium underline underline-offset-4"
						>
							{t("application.build.productionGuide")}
						</a>{" "}
						{t("application.build.resourcesWarningSuffix")}
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
									<FormLabel>{t("application.build.title")}</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											value={field.value}
											className="flex flex-col space-y-1"
										>
											{Object.entries(buildTypeDisplayMap).map(
												([value, label]) => (
													<FormItem
														key={value}
														className="flex items-center space-x-3 space-y-0"
													>
														<FormControl>
															<RadioGroupItem value={value} />
														</FormControl>
														<FormLabel className="font-normal">
															{label}
															{value === BuildType.railpack && (
																<Badge className="ml-2 px-1 text-xs">
																	{t("application.build.new")}
																</Badge>
															)}
														</FormLabel>
													</FormItem>
												),
											)}
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
										<FormLabel>
											{t("application.build.herokuVersion")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"application.build.herokuVersionPlaceholder",
												)}
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
											<FormLabel>{t("application.build.dockerFile")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"application.build.dockerFilePlaceholder",
													)}
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
											<FormLabel>
												{t("application.build.dockerContextPath")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"application.build.dockerContextPathPlaceholder",
													)}
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
												<FormLabel>
													{t("application.build.dockerBuildStage")}
												</FormLabel>
												<FormDescription>
													{t("application.build.dockerBuildStageDescription")}
												</FormDescription>
											</div>
											<FormControl>
												<Input
													placeholder={t(
														"application.build.dockerBuildStagePlaceholder",
													)}
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
											<FormLabel>
												{t("application.build.publishDirectory")}
											</FormLabel>
											<FormDescription>
												{t("application.build.publishDirectoryDescription")}
											</FormDescription>
										</div>
										<FormControl>
											<Input
												placeholder={t("application.build.publishDirectory")}
												{...field}
												value={field.value ?? ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{buildType === BuildType.nixpacks && publishDirectory && (
							<FormField
								control={form.control}
								name="isStaticSpa"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<div className="flex items-center gap-x-2 p-2">
												<Checkbox
													id="checkboxIsStaticSpaNixpacks"
													value={String(field.value)}
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
												<FormLabel htmlFor="checkboxIsStaticSpaNixpacks">
													{t("application.build.spa")}
												</FormLabel>
											</div>
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
													{t("application.build.spa")}
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
											<FormLabel>
												{t("application.build.railpackVersion")}
											</FormLabel>
											<FormControl>
												{isManualRailpackVersion ? (
													<div className="space-y-2">
														<Input
															placeholder={t(
																"application.build.customVersionPlaceholder",
															)}
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
															{t("application.build.usePredefinedVersions")}
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
																placeholder={t(
																	"application.build.selectRailpack",
																)}
															/>
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="manual">
																<span className="font-medium">
																	✏️ {t("application.build.manualVersion")}
																</span>
															</SelectItem>
															{RAILPACK_VERSIONS.map((version) => (
																<SelectItem key={version} value={version}>
																	v{version}
																	{version === "0.15.4" && (
																		<Badge
																			variant="secondary"
																			className="ml-2 px-1 text-xs"
																		>
																			{t("application.build.latest")}
																		</Badge>
																	)}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												)}
											</FormControl>
											<FormDescription>
												{t("application.build.railpackVersionDescription")}{" "}
												<a
													href="https://github.com/railwayapp/railpack/releases"
													target="_blank"
													rel="noreferrer"
													className="text-primary underline underline-offset-4"
												>
													{t("application.build.viewReleases")}
												</a>
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}
						<div className="flex w-full justify-end">
							<Button isLoading={isPending} type="submit">
								{t("application.build.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
