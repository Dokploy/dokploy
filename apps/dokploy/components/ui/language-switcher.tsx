"use client";
import { Check, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/config";

const LanguageItems = () => {
	const { i18n } = useTranslation();

	return (
		<>
			{SUPPORTED_LANGUAGES.map((lang) => (
				<DropdownMenuItem
					key={lang.code}
					className="cursor-pointer"
					onClick={() => {
						i18n.changeLanguage(lang.code);
					}}
				>
					{lang.name}
					{i18n.language === lang.code && <Check className="ml-auto size-4" />}
				</DropdownMenuItem>
			))}
		</>
	);
};

/**
 * Standalone dropdown switcher (used on auth/onboarding pages).
 */
export const LanguageSwitcher = () => {
	const { t } = useTranslation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="gap-2">
					<Languages className="size-4" />
					{t("language.label")}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
				<LanguageItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

/**
 * Inline entry for embedding inside an existing dropdown menu.
 */
export const LanguageSwitcherItem = () => {
	const { t } = useTranslation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
				>
					<Languages className="size-4" />
					{t("language.label")}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<LanguageItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
