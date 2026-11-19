import {
	AlertTriangle,
	CheckCircle2,
	HardDriveDownload,
	Loader2,
	RefreshCw,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

type ServiceStatus = {
	status: "healthy" | "unhealthy";
	message?: string;
};

type HealthResult = {
	postgres: ServiceStatus;
	traefik: ServiceStatus;
};

type ModalState = "idle" | "checking" | "results" | "updating";

const ServiceStatusItem = ({
	name,
	service,
}: {
	name: string;
	service: ServiceStatus;
}) => (
	<div className="flex items-center gap-2">
		{service.status === "healthy" ? (
			<CheckCircle2 className="h-4 w-4 text-green-500" />
		) : (
			<XCircle className="h-4 w-4 text-red-500" />
		)}
		<span className="text-sm font-medium">{name}</span>
		{service.status === "unhealthy" && service.message && (
			<span className="text-xs text-muted-foreground">— {service.message}</span>
		)}
	</div>
);

export const UpdateWebServer = ({
	buttonClassName,
}: {
	buttonClassName?: string;
}) => {
	const { t } = useTranslation();
	const [modalState, setModalState] = useState<ModalState>("idle");
	const [open, setOpen] = useState(false);
	const [healthResult, setHealthResult] = useState<HealthResult | null>(null);

	const { mutateAsync: updateServer } = api.settings.updateServer.useMutation();
	const { refetch: checkHealth } =
		api.settings.checkInfrastructureHealth.useQuery(undefined, {
			enabled: false,
		});

	const handleVerify = async () => {
		setModalState("checking");
		setHealthResult(null);

		try {
			const result = await checkHealth();
			if (result.data) {
				setHealthResult(result.data);
			}
		} catch {
			// checkHealth failed entirely
		}
		setModalState("results");
	};

	const allHealthy =
		healthResult &&
		healthResult.postgres.status === "healthy" &&
		healthResult.traefik.status === "healthy";

	const checkIsUpdateFinished = async () => {
		try {
			const response = await fetch("/api/health");
			if (!response.ok) {
				throw new Error("Health check failed");
			}

			toast.success(t("settings.webServer.updateWebServer.updated"));

			setTimeout(() => {
				window.location.reload();
			}, 2000);
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			void checkIsUpdateFinished();
		}
	};

	const handleConfirm = async () => {
		try {
			setModalState("updating");
			await updateServer();

			await new Promise((resolve) => setTimeout(resolve, 8000));

			await checkIsUpdateFinished();
		} catch (error) {
			setModalState("results");
			console.error("Error updating server:", error);
			const message =
				error instanceof Error && error.message
					? error.message
					: t("settings.webServer.updateWebServer.updateError");
			toast.error(message);
		}
	};

	const handleClose = () => {
		if (modalState !== "updating") {
			setOpen(false);
			setModalState("idle");
			setHealthResult(null);
		}
	};

	return (
		<AlertDialog open={open}>
			<AlertDialogTrigger asChild>
				<Button
					className={cn("relative w-full", buttonClassName)}
					variant="secondary"
					onClick={() => setOpen(true)}
				>
					<HardDriveDownload className="h-4 w-4" />
					<span className="absolute -right-1 -top-2 flex h-3 w-3">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
						<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
					</span>
					{t("settings.webServer.updateWebServer.trigger")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{modalState === "idle" &&
							t("settings.webServer.updateWebServer.idleTitle")}
						{modalState === "checking" &&
							t("settings.webServer.updateWebServer.checkingTitle")}
						{modalState === "results" &&
							(allHealthy
								? t("settings.webServer.updateWebServer.readyTitle")
								: t("settings.webServer.updateWebServer.issuesTitle"))}
						{modalState === "updating" &&
							t("settings.webServer.updateWebServer.updatingTitle")}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div>
							{modalState === "idle" && (
								<span>
									{t("settings.webServer.updateWebServer.idleDescription")}
									<br />
									<br />
									{t("settings.webServer.updateWebServer.verifyHint")}
								</span>
							)}

							{modalState === "checking" && (
								<span className="flex items-center gap-2">
									<Loader2 className="animate-spin h-4 w-4" />
									{t("settings.webServer.updateWebServer.checkingServices")}
								</span>
							)}

							{modalState === "results" && healthResult && (
								<div className="flex flex-col gap-3">
									<div className="flex flex-col gap-2">
										<ServiceStatusItem
											name="PostgreSQL"
											service={healthResult.postgres}
										/>
										<ServiceStatusItem
											name="Traefik"
											service={healthResult.traefik}
										/>
									</div>

									{!allHealthy && (
										<div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
											<AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
											<span className="text-sm text-yellow-600 dark:text-yellow-400">
												{t("settings.webServer.updateWebServer.someUnhealthy")}
											</span>
										</div>
									)}

									{allHealthy && (
										<span className="text-sm text-muted-foreground">
											{t("settings.webServer.updateWebServer.allHealthy")}
										</span>
									)}
								</div>
							)}

							{modalState === "results" && !healthResult && (
								<div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
									<AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
									<span className="text-sm text-yellow-600 dark:text-yellow-400">
										{t("settings.webServer.updateWebServer.couldNotVerify")}
									</span>
								</div>
							)}

							{modalState === "updating" && (
								<span className="flex items-center gap-2">
									<Loader2 className="animate-spin h-4 w-4" />
									{t("settings.webServer.updateWebServer.updatingHint")}
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				{modalState === "idle" && (
					<AlertDialogFooter>
						<AlertDialogCancel onClick={handleClose}>
							{t("settings.servers.deleteServer.cancel")}
						</AlertDialogCancel>
						<Button variant="secondary" onClick={handleVerify}>
							<RefreshCw className="h-4 w-4" />
							{t("settings.webServer.updateWebServer.verifyStatus")}
						</Button>
						<AlertDialogAction onClick={handleConfirm}>
							{t("settings.webServer.dockerTerminal.confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				)}
				{modalState === "results" && (
					<AlertDialogFooter>
						<AlertDialogCancel onClick={handleClose}>
							{t("settings.servers.deleteServer.cancel")}
						</AlertDialogCancel>
						<Button variant="secondary" onClick={handleVerify}>
							<RefreshCw className="h-4 w-4" />
							{t("settings.webServer.updateWebServer.recheck")}
						</Button>
						<AlertDialogAction onClick={handleConfirm}>
							{allHealthy
								? t("settings.webServer.dockerTerminal.confirm")
								: t("settings.webServer.updateWebServer.confirmAnyway")}
						</AlertDialogAction>
					</AlertDialogFooter>
				)}
			</AlertDialogContent>
		</AlertDialog>
	);
};
