import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
}

const QcSettingsSchema = z.object({
	qcEnabled: z.boolean(),
	qcProjectId: z.string(),
	qcFailurePolicy: z.enum(["open", "closed"]),
	testExecEnabled: z.boolean(),
	testCommand: z.string(),
	testExecFailurePolicy: z.enum(["open", "closed"]),
});

type QcSettings = z.infer<typeof QcSettingsSchema>;

export const ShowQcSettings = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);
	const utils = api.useUtils();
	const { mutateAsync, isPending } = api.application.update.useMutation();

	const form = useForm<QcSettings>({
		defaultValues: {
			qcEnabled: false,
			qcProjectId: "",
			qcFailurePolicy: "open",
			testExecEnabled: false,
			testCommand: "",
			testExecFailurePolicy: "closed",
		},
		resolver: zodResolver(QcSettingsSchema),
	});

	// Background refetches (the server fills in qcProjectId during a deploy, the
	// Test Plan tab polls the same query) must not wipe what is being typed.
	const { dirtyFields } = form.formState;

	useEffect(() => {
		if (data) {
			form.reset(
				{
					qcEnabled: data.qcEnabled ?? false,
					qcProjectId: data.qcProjectId || "",
					qcFailurePolicy: data.qcFailurePolicy || "open",
					testExecEnabled: data.testExecEnabled ?? false,
					testCommand: data.testCommand || "",
					testExecFailurePolicy: data.testExecFailurePolicy || "closed",
				},
				{ keepDirtyValues: true },
			);
		}
	}, [data, form]);

	const onSubmit = async (input: QcSettings) => {
		// Only send what the user touched, so an untouched field (notably
		// qcProjectId, which a deploy may have just filled in) can't be
		// overwritten with a stale form value.
		const changed = Object.keys(dirtyFields) as (keyof QcSettings)[];
		if (changed.length === 0) {
			toast.info("No changes to save");
			return;
		}
		const payload: Partial<Record<keyof QcSettings, string | boolean | null>> =
			{};
		for (const key of changed) {
			const value = input[key];
			payload[key] =
				(key === "qcProjectId" || key === "testCommand") && value === ""
					? null
					: value;
		}
		await mutateAsync({
			applicationId,
			...payload,
		} as Parameters<typeof mutateAsync>[0])
			.then(async () => {
				toast.success("QC settings updated");
				await utils.application.one.invalidate({ applicationId });
			})
			.catch(() => {
				toast.error("Error updating QC settings");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">QC & Test Automation</CardTitle>
				<CardDescription>
					Runs before build/deploy: generates or updates a test-plan via QC
					Agent, and optionally runs the app's own test command inside the built
					image.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="qcEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-xs">
									<div className="space-y-0.5">
										<FormLabel>QC test-plan step</FormLabel>
										<FormDescription>
											Blocks the build until QC Agent generates (first deploy)
											or updates (redeploy) the test-plan document.
										</FormDescription>
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
						<FormField
							control={form.control}
							name="qcProjectId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>QC Agent Project ID (optional)</FormLabel>
									<FormControl>
										<Input
											placeholder="Auto-detected from this app's repo on first deploy"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Leave empty — QC Agent resolves and fills this in
										automatically from the application's own git repo. Only set
										it by hand to point this app at an existing QC Agent project
										instead.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="qcFailurePolicy"
							render={({ field }) => (
								<FormItem>
									<FormLabel>If QC Agent errors or times out</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="open">
												Skip & continue deploy
											</SelectItem>
											<SelectItem value="closed">Block deploy</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						<Separator />

						<FormField
							control={form.control}
							name="testExecEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-xs">
									<div className="space-y-0.5">
										<FormLabel>Run tests before deploy</FormLabel>
										<FormDescription>
											Runs the command below inside the image just built, right
											after build and before the container is swapped.
										</FormDescription>
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
						<FormField
							control={form.control}
							name="testCommand"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Test command</FormLabel>
									<FormControl>
										<Input placeholder="npm test" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="testExecFailurePolicy"
							render={({ field }) => (
								<FormItem>
									<FormLabel>If tests fail</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="closed">Block deploy</SelectItem>
											<SelectItem value="open">
												Warn & continue deploy
											</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex justify-end">
							<Button isLoading={isPending} type="submit" className="w-fit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
