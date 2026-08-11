import { createFileRoute } from "@tanstack/react-router";
import { ShowHome } from "@/components/dashboard/home/show-home";

const Home = () => {
	return <ShowHome />;
};

export const Route = createFileRoute("/dashboard/home")({
	component: Home,
});
