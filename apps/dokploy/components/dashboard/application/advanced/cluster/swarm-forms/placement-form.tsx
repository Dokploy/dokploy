import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const PreferenceSchema = z.object({
	SpreadDescriptor: z.string(),
});

const PlatformSchema = z.object({
	Architecture: z.string(),
	OS: z.string(),
});

export const placementFormSchema = z.object({
	Constraints: z.array(z.string()).optional(),
	Preferences: z.array(PreferenceSchema).optional(),
	MaxReplicas: z.coerce.number().optional(),
	Platforms: z.array(PlatformSchema).optional(),
});

interface PlacementFormProps {
	id: string;
	type:
		| "postgres"
		| "mariadb"
		| "mongo"
		| "mysql"
		| "redis"
		| "application"
		| "libsql";
}

export const PlacementForm = ({ id, type }: PlacementFormProps) => {
	const { t } = useTranslation();
	const [isLoading, setIsLoading] = useState(false);

	const queryMap = {
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
		libsql: () => api.libsql.one.useQuery({ libsqlId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });

	const mutationMap = {
		postgres: () => api.postgres.update.useMutation(),
		redis: () => api.redis.update.useMutation(),
		mysql: () => api.mysql.update.useMutation(),
		mariadb: () => api.mariadb.update.useMutation(),
		application: () => api.application.update.useMutation(),
		mongo: () => api.mongo.update.useMutation(),
		libsql: () => api.libsql.update.useMutation(),
	};

	const { mutateAsync } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const form = useForm<any>({
		resolver: zodResolver(placementFormSchema),
		defaultValues: {
			Constraints: [],
			Preferences: [],
			MaxReplicas: undefined,
			Platforms: [],
		},
	});

	const constraints = form.watch("Constraints") || [];
	const preferences = form.watch("Preferences") || [];
	const platforms = form.watch("Platforms") || [];

	useEffect(() => {
		if (data?.placementSwarm) {
			const placement = data.placementSwarm;
			form.reset({
				Constraints: placement.Constraints || [],
				Preferences:
					placement.Preferences?.map((p: any) => ({
						SpreadDescriptor: p.Spread?.SpreadDescriptor || "",
					})) || [],
				MaxReplicas: placement.MaxReplicas,
				Platforms: placement.Platforms || [],
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: z.infer<typeof placementFormSchema>) => {
		setIsLoading(true);
		try {
			// Check if all values are empty, if so, send null to clear the database
			const hasAnyValue =
				(formData.Constraints && formData.Constraints.length > 0) ||
				(formData.Preferences && formData.Preferences.length > 0) ||
				(formData.Platforms && formData.Platforms.length > 0) ||
				formData.MaxReplicas !== undefined;

			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				libsqlId: id || "",
				placementSwarm: hasAnyValue
					? {
							...formData,
							Preferences: formData.Preferences?.map((p) => ({
								Spread: { SpreadDescriptor: p.SpreadDescriptor },
							})),
						}
					: null,
			});

			toast.success(t("application.swarm.placementForm.updated"));
			refetch();
		} catch {
			toast.error(t("application.swarm.placementForm.updateError"));
		} finally {
			setIsLoading(false);
		}
	};

	const addConstraint = () => {
		form.setValue("Constraints", [...constraints, ""]);
	};

	const updateConstraint = (index: number, value: string) => {
		const newConstraints = [...constraints];
		newConstraints[index] = value;
		form.setValue("Constraints", newConstraints);
	};

	const removeConstraint = (index: number) => {
		form.setValue(
			"Constraints",
			constraints.filter((_: string, i: number) => i !== index),
		);
	};

	const addPreference = () => {
		form.setValue("Preferences", [...preferences, { SpreadDescriptor: "" }]);
	};

	const updatePreference = (index: number, value: string) => {
		const newPreferences = [...preferences];
		if (newPreferences[index]) {
			newPreferences[index].SpreadDescriptor = value;
			form.setValue("Preferences", newPreferences);
		}
	};

	const removePreference = (index: number) => {
		form.setValue(
			"Preferences",
			preferences.filter((_: any, i: number) => i !== index),
		);
	};

	const addPlatform = () => {
		form.setValue("Platforms", [...platforms, { Architecture: "", OS: "" }]);
	};

	const updatePlatform = (
		index: number,
		field: "Architecture" | "OS",
		value: string,
	) => {
		const newPlatforms = [...platforms];
		if (newPlatforms[index]) {
			newPlatforms[index][field] = value;
			form.setValue("Platforms", newPlatforms);
		}
	};

	const removePlatform = (index: number) => {
		form.setValue(
			"Platforms",
			platforms.filter((_: any, i: number) => i !== index),
		);
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<div>
					<FormLabel>
						{t("application.swarm.placementForm.constraints")}
					</FormLabel>
					<FormDescription>
						{t("application.swarm.placementForm.constraintsDescription")}
					</FormDescription>
					<div className="space-y-2 mt-2">
						{constraints.map((constraint: string, index: number) => (
							<div key={index} className="flex gap-2">
								<Input
									value={constraint}
									onChange={(e) => updateConstraint(index, e.target.value)}
									placeholder="node.role==manager"
								/>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => removeConstraint(index)}
								>
									{t("application.swarm.remove")}
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addConstraint}
						>
							{t("application.swarm.placementForm.addConstraint")}
						</Button>
					</div>
				</div>

				<div>
					<FormLabel>
						{t("application.swarm.placementForm.preferences")}
					</FormLabel>
					<FormDescription>
						{t("application.swarm.placementForm.preferencesDescription")}
					</FormDescription>
					<div className="space-y-2 mt-2">
						{preferences.map((pref: any, index: number) => (
							<div key={index} className="flex gap-2">
								<Input
									value={pref.SpreadDescriptor}
									onChange={(e) => updatePreference(index, e.target.value)}
									placeholder="node.labels.region"
								/>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => removePreference(index)}
								>
									{t("application.swarm.remove")}
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addPreference}
						>
							{t("application.swarm.placementForm.addPreference")}
						</Button>
					</div>
				</div>

				<FormField
					control={form.control}
					name="MaxReplicas"
					render={({ field }) => (
						<FormItem>
							<FormLabel>
								{t("application.swarm.placementForm.maxReplicas")}
							</FormLabel>
							<FormDescription>
								{t("application.swarm.placementForm.maxReplicasDescription")}
							</FormDescription>
							<FormControl>
								<Input type="number" placeholder="10" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div>
					<FormLabel>
						{t("application.swarm.placementForm.platforms")}
					</FormLabel>
					<FormDescription>
						{t("application.swarm.placementForm.platformsDescription")}
					</FormDescription>
					<div className="space-y-2 mt-2">
						{platforms.map((platform: any, index: number) => (
							<div key={index} className="flex gap-2">
								<Input
									value={platform.Architecture}
									onChange={(e) =>
										updatePlatform(index, "Architecture", e.target.value)
									}
									placeholder="amd64"
								/>
								<Input
									value={platform.OS}
									onChange={(e) => updatePlatform(index, "OS", e.target.value)}
									placeholder="linux"
								/>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => removePlatform(index)}
								>
									{t("application.swarm.remove")}
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addPlatform}
						>
							{t("application.swarm.placementForm.addPlatform")}
						</Button>
					</div>
				</div>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							form.reset({
								Constraints: [],
								Preferences: [],
								MaxReplicas: undefined,
								Platforms: [],
							});
						}}
					>
						{t("application.swarm.clear")}
					</Button>
					<Button type="submit" isLoading={isLoading}>
						{t("application.swarm.placementForm.save")}
					</Button>
				</div>
			</form>
		</Form>
	);
};
