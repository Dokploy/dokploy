import type { NextRequest } from "next/server";
import { renderToString } from "react-dom/server";
import Page418 from "../hola"; // Importa la página 418

export const GET = async (req: NextRequest) => {
	// Renderiza el componente de la página 418 como HTML
	const htmlContent = renderToString(Page418());

	// Devuelve la respuesta con el código de estado HTTP 418
	return new Response(htmlContent, {
		headers: {
			"Content-Type": "text/html",
		},
		status: 418,
	});
};

export default GET;
