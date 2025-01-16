import { cookies } from "next/headers";
import Page from "./side";

export default function SideWrapper({
	children,
}: { children: React.ReactNode }) {
	const cookieStore = cookies();
	const defaultOpen = cookieStore.get("sidebar:state")?.value === "true";

	return <Page defaultOpen={defaultOpen}>{children}</Page>;
}
