"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

type Props = {
	className?: string;
};

type TranslateFn = ReturnType<typeof useTranslations>;

const toPlanLabel = (t: TranslateFn, raw: string): string => {
	switch (raw) {
		case "free":
			return t("plan.free");
		case "pro":
			return t("plan.pro");
		case "agency":
			return t("plan.agency");
		default:
			return t("plan.unknown", { plan: raw });
	}
};

export const SidebarUserCard = ({ className }: Props) => {
	const t = useTranslations("sidebar");
	const { data: user } = api.user.get.useQuery();
	const { data: subscription } = api.billing.getSubscription.useQuery();

	const email = user?.user?.email ?? "";
	const avatarLetter = (email.trim().at(0) ?? "?").toUpperCase();
	const plan = subscription?.status === "active" ? subscription.plan : "free";
	const planLabel = toPlanLabel(t, plan);

	return (
		<SidebarMenuButton
			asChild
			size="lg"
			className={cn(
				"data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
				className,
			)}
		>
			<Link href="/dashboard/settings/profile" className="flex items-center gap-3">
				<Avatar className="h-8 w-8 rounded-lg">
					<AvatarFallback className="rounded-lg">{avatarLetter}</AvatarFallback>
				</Avatar>
				<div className="grid flex-1 text-left text-sm leading-tight">
					<span className="truncate font-medium">{email}</span>
					<span className="truncate text-xs text-muted-foreground">
						{planLabel}
					</span>
				</div>
			</Link>
		</SidebarMenuButton>
	);
};

