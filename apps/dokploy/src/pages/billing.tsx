import type { GetServerSidePropsContext } from "next";

/**
 * Старые Success/Fail URL в личном кабинете Тинькофф могли указывать на `/billing`.
 * Редирект на актуальный путь настроек биллинга.
 */
export default function BillingLegacyRedirect() {
	return null;
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(ctx.query)) {
		if (typeof value === "string") {
			search.set(key, value);
		}
	}

	const qs = search.toString();
	const destination = `/dashboard/settings/billing${qs ? `?${qs}` : ""}`;

	return {
		redirect: {
			destination,
			permanent: false,
		},
	};
}
