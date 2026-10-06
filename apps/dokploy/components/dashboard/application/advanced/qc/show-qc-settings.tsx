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
	qcFailurePolicy: z.enum(["open", "closed"]),
	testExecEnabled: z.boolean(),
	testExecSource: z.enum(["command", "generated"]),
	testCommand: z.string(),
	testRunnerImage: z.string(),
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
			qcFailurePolicy: "open",
			testExecEnabled: false,
			testExecSource: "command",
			testCommand: "",
			testRunnerImage: "",
			testExecFailurePolicy: "closed",
		},
		resolver: zodResolver(QcSettingsSchema),
	});

	// Background refetches (the Test Plan tab polls the same query) must not
	// wipe what is being typed.
	const { dirtyFields } = form.formState;
	const testSource = form.watch("testExecSource");

	useEffect(() => {
		if (data) {
			form.reset(
				{
					qcEnabled: data.qcEnabled ?? false,
					qcFailurePolicy: data.qcFailurePolicy || "open",
					testExecEnabled: data.testExecEnabled ?? false,
					testExecSource: data.testExecSource || "command",
					testCommand: data.testCommand || "",
					testRunnerImage: data.testRunnerImage || "",
					testExecFailurePolicy: data.testExecFailurePolicy || "closed",
				},
				{ keepDirtyValues: true },
			);
		}
	}, [data, form]);

	const onSubmit = async (input: QcSettings) => {
		// Only send what the user touched, so an untouched field can't be
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
				(key === "testCommand" || key === "testRunnerImage") && value === ""
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
					Runs after the repo is cloned and before the build: generates or
					updates a test-plan via the QC service, and optionally runs tests
					before the app is deployed.
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
											Blocks the build until the QC service generates (first
											deploy) or updates (redeploy) the test-plan document.
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
							name="qcFailurePolicy"
							render={({ field }) => (
								<FormItem>
									<FormLabel>If the QC service errors or times out</FormLabel>
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
											Runs the tests below before the new version replaces the
											running one.
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
							name="testExecSource"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Which tests</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="command">
												My own test command, inside the built image
											</SelectItem>
											<SelectItem value="generated">
												Tests generated by the QC service
											</SelectItem>
										</SelectContent>
									</Select>
									{testSource === "generated" && (
										<FormDescription>
											Needs the QC test-plan step and a GitHub or Git source.
											Node, Python and Go projects are supported. The tests run
											in a throw-away container with a copy of the source and no
											access to the application's environment.
										</FormDescription>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>
						{testSource === "command" ? (
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
						) : (
							<FormField
								control={form.control}
								name="testRunnerImage"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Test runner image (optional)</FormLabel>
										<FormControl>
											<Input
												placeholder="Default: node:22, python:3.12 or golang:1.23"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											The container image the generated tests run in. Leave
											empty to pick one from the project's language.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
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
