import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";

export function SlimLayout() {
	const t = useTranslations("404");
	return (
		<>
			<main className="flex flex-auto items-center justify-center text-center">
				<div>
					<h1 className="mb-4 text-6xl font-semibold text-primary">404</h1>
					<p className="mb-4 text-lg text-muted-foreground">{t("title")}</p>
					<p className="mt-4 text-muted-foreground">
						{t("des")}{" "}
						<Link href="/" className="text-primary">
							{t("action")}
						</Link>
	p				</p>
				</div>
			</main>
		</>
	);
}
