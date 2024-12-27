import { ShowBilling } from "@/components/dashboard/settings/billing/show-billing";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import type React from "react";
import { useEffect, useState } from "react";

export const ShowWelcomeDokploy = () => {
	const { data } = api.auth.get.useQuery();
	const [open, setOpen] = useState(false);

	const { data: isCloud, isLoading } = api.settings.isCloud.useQuery();

	if (!isCloud || data?.rol !== "admin") {
		return null;
	}

	useEffect(() => {
		if (
			!isLoading &&
			isCloud &&
			!localStorage.getItem("hasSeenCloudWelcomeModal") &&
			data?.rol === "admin"
		) {
			setOpen(true);
		}
	}, [isCloud, isLoading]);

	const handleClose = (isOpen: boolean) => {
		if (data?.rol === "admin") {
			setOpen(isOpen);
			if (!isOpen) {
				localStorage.setItem("hasSeenCloudWelcomeModal", "true"); // Establece el flag al cerrar el modal
			}
		}
	};

	return (
		<>
			<Dialog open={open} onOpenChange={handleClose}>
				<DialogContent className="max-h-screen overflow-y-auto sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="text-center font-semibold text-2xl">
							Welcome to Dokploy Cloud 🎉
						</DialogTitle>
						<p className="mt-2 text-center text-muted-foreground text-sm">
							Unlock powerful features to streamline your deployments and manage
							projects effortlessly.
						</p>
					</DialogHeader>
					<div className="mt-4 space-y-3 text-primary text-sm ">
						<ShowBilling />
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
};
