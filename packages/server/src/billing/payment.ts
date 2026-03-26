import { createHash } from "node:crypto";

import { logger } from "../lib/logger";

const RUB_TO_KOPEK_MULTIPLIER = 100;
const REQUEST_TIMEOUT_MS = 30_000;

type TinkoffApiStatus =
	| "NEW"
	| "FORM_SHOWED"
	| "DEADLINE_EXPIRED"
	| "AUTHORIZED"
	| "CONFIRMED"
	| "REJECTED"
	| "REFUNDED"
	| "PARTIAL_REFUNDED"
	| "CANCELED";

type PaymentStatus =
	| "NEW"
	| "AUTHORIZED"
	| "CONFIRMED"
	| "REJECTED"
	| "REFUNDED"
	| "CANCELED";

type AddCardCheckType = "NO" | "HOLD" | "3DS" | "3DSHOLD";

interface TinkoffApiBaseResponse {
	Success: boolean;
	ErrorCode: string;
	Message?: string;
	Details?: string;
}

interface TinkoffInitResponse extends TinkoffApiBaseResponse {
	PaymentId?: string;
	PaymentURL?: string;
}

interface TinkoffConfirmResponse extends TinkoffApiBaseResponse {
	PaymentId?: string;
	Status?: TinkoffApiStatus | string;
}

interface TinkoffGetStateResponse extends TinkoffApiBaseResponse {
	Status?: TinkoffApiStatus | string;
	Amount?: number;
	OrderId?: string;
	PaymentId?: string;
}

interface TinkoffChargeResponse extends TinkoffApiBaseResponse {
	PaymentId?: string;
	Status?: TinkoffApiStatus | string;
}

interface TinkoffAddCardResponse extends TinkoffApiBaseResponse {
	PaymentURL?: string;
	RedirectUrl?: string;
}

interface TinkoffCardItem {
	CardId?: string;
	Pan?: string;
	ExpDate?: string;
	RebillId?: string;
	RebillID?: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (!value || typeof value !== "object") return false;
	if (Array.isArray(value)) return false;
	return true;
};

const rubToKopek = (amountRub: number): number => {
	const amount = Math.round(amountRub * RUB_TO_KOPEK_MULTIPLIER);
	return amount;
};

const kopekToRub = (amountKopek: number): number => {
	return amountKopek / RUB_TO_KOPEK_MULTIPLIER;
};

const normalizeStatus = (status: string): PaymentStatus => {
	if (status === "NEW") return "NEW";
	if (status === "FORM_SHOWED") return "NEW";
	if (status === "DEADLINE_EXPIRED") return "CANCELED";
	if (status === "AUTHORIZED") return "AUTHORIZED";
	if (status === "CONFIRMED") return "CONFIRMED";
	if (status === "REJECTED") return "REJECTED";
	if (status === "REFUNDED") return "REFUNDED";
	if (status === "PARTIAL_REFUNDED") return "REFUNDED";
	if (status === "CANCELED") return "CANCELED";

	logger.warn({ status }, "Unexpected Tinkoff status");
	return "REJECTED";
};

const buildToken = (params: Record<string, unknown>, password: string): string => {
	const flat: Record<string, string> = {};

	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null) continue;
		if (isPlainObject(value) || Array.isArray(value)) continue;
		flat[key] = String(value);
	}

	flat.Password = password;

	const concatenated = Object.keys(flat)
		.sort((a, b) => a.localeCompare(b))
		.map((k) => flat[k] ?? "")
		.join("");

	return createHash("sha256").update(concatenated, "utf8").digest("hex");
};

const fetchWithTimeout = async (
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timeoutId);
	}
};

const TRAILING_SLASHES_RE = /\/+$/;

/**
 * Абсолютный публичный origin без завершающего `/`.
 * Для SuccessURL/FailURL в Тинькофф нужен полный URL; берём NEXT_PUBLIC_APP_URL или APP_URL (Docker/сервер).
 */
const publicAppBaseUrl = (): string => {
	const raw = (
		process.env.NEXT_PUBLIC_APP_URL ??
		process.env.APP_URL ??
		""
	).trim();
	return raw.replace(TRAILING_SLASHES_RE, "");
};

/** Реальный экран биллинга в приложении (не `/billing`). */
const TINKOFF_RETURN_PATH = "/dashboard/settings/billing";

interface TinkoffPaymentConfig {
	terminalKey: string;
	password: string;
	baseUrl: string;
	successUrl: string;
	failUrl: string;
	notificationUrl: string;
	defaultAddCardCheckType?: AddCardCheckType;
	requestTimeoutMs?: number;
}

export class TinkoffPayment {
	private readonly terminalKey: string;
	private readonly password: string;
	private readonly baseUrl: string;
	private readonly successUrl: string;
	private readonly failUrl: string;
	private readonly notificationUrl: string;
	private readonly defaultAddCardCheckType: AddCardCheckType;
	private readonly requestTimeoutMs: number;

	public constructor(config: TinkoffPaymentConfig) {
		this.terminalKey = config.terminalKey;
		this.password = config.password;
		this.baseUrl = config.baseUrl.replace(/\/+$/, "");
		this.successUrl = config.successUrl;
		this.failUrl = config.failUrl;
		this.notificationUrl = config.notificationUrl;
		this.defaultAddCardCheckType = config.defaultAddCardCheckType ?? "3DSHOLD";
		this.requestTimeoutMs = config.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
	}

	private async requestRaw(
		method: string,
		payload: Record<string, unknown>,
	): Promise<unknown> {
		const requestBody: Record<string, unknown> = {
			TerminalKey: this.terminalKey,
			...payload,
		};

		requestBody.Token = buildToken(requestBody, this.password);

		const url = `${this.baseUrl}/${method}`;

		try {
			const response = await fetchWithTimeout(
				url,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(requestBody),
				},
				this.requestTimeoutMs,
			);

			const text = await response.text();
			if (!response.ok) {
				logger.error(
					{ url, status: response.status, body: text },
					"Tinkoff HTTP error",
				);
				throw new Error("Tinkoff HTTP error");
			}

			return text ? (JSON.parse(text) as unknown) : null;
		} catch (error) {
			const isAbort =
				error instanceof DOMException && error.name === "AbortError";
			logger.error({ url, isAbort, error }, "Tinkoff request failed");
			throw error instanceof Error ? error : new Error("Tinkoff request failed");
		}
	}

	private async request<TResponse extends TinkoffApiBaseResponse>(
		method: string,
		payload: Record<string, unknown>,
	): Promise<TResponse> {
		const parsed = await this.requestRaw(method, payload);
		if (!isPlainObject(parsed)) {
			logger.error({ method, parsed }, "Tinkoff invalid JSON response");
			throw new Error("Tinkoff invalid JSON response");
		}

		return parsed as TResponse;
	}

	public async init(params: {
		amount: number;
		orderId?: string;
		description: string;
		userId: string;
		successUrl?: string;
		failUrl?: string;
		recurrent?: boolean;
	}): Promise<{ paymentUrl: string; paymentId: string }> {
		const orderId = params.orderId ?? `${params.userId}-${Date.now()}`;
		const response = await this.request<TinkoffInitResponse>("Init", {
			Amount: rubToKopek(params.amount),
			OrderId: orderId,
			Description: params.description,
			CustomerKey: params.userId,
			SuccessURL: params.successUrl ?? this.successUrl,
			FailURL: params.failUrl ?? this.failUrl,
			NotificationURL: this.notificationUrl,
			Recurrent: params.recurrent ? "Y" : undefined,
		});

		if (!response.Success) {
			logger.warn(
				{
					errorCode: response.ErrorCode,
					message: response.Message,
					details: response.Details,
					orderId,
				},
				"Tinkoff Init failed",
			);
			throw new Error("Tinkoff Init failed");
		}

		const paymentUrl = response.PaymentURL;
		const paymentId = response.PaymentId;
		if (!paymentUrl || !paymentId) {
			logger.error({ response }, "Tinkoff Init missing PaymentURL/PaymentId");
			throw new Error("Tinkoff Init missing PaymentURL/PaymentId");
		}

		return { paymentUrl, paymentId };
	}

	public async confirm(paymentId: string): Promise<boolean> {
		const response = await this.request<TinkoffConfirmResponse>("Confirm", {
			PaymentId: paymentId,
		});

		if (!response.Success) {
			logger.warn(
				{
					paymentId,
					errorCode: response.ErrorCode,
					message: response.Message,
					details: response.Details,
					status: response.Status,
				},
				"Tinkoff Confirm failed",
			);
			return false;
		}

		return true;
	}

	public async charge(params: {
		userId: string;
		amount: number;
		description: string;
		rebillId: string;
	}): Promise<{
		success: boolean;
		paymentId: string;
		failureKind?: "REJECTED" | "UNKNOWN";
	}> {
		const { paymentId } = await this.init({
			amount: params.amount,
			description: params.description,
			userId: params.userId,
			recurrent: true,
		});

		try {
			const response = await this.request<TinkoffChargeResponse>("Charge", {
				PaymentId: paymentId,
				RebillId: params.rebillId,
			});

			if (response.Success) {
				return { success: true, paymentId };
			}

			const status = response.Status ? String(response.Status) : "";
			const failureKind =
				status === "REJECTED" ? ("REJECTED" as const) : ("UNKNOWN" as const);

			logger.warn(
				{
					paymentId,
					status,
					errorCode: response.ErrorCode,
					message: response.Message,
					details: response.Details,
				},
				"Tinkoff Charge failed",
			);

			return { success: false, paymentId, failureKind };
		} catch (error) {
			logger.error({ paymentId, error }, "Tinkoff Charge request error");
			return { success: false, paymentId, failureKind: "UNKNOWN" };
		}
	}

	public async cancel(params: {
		paymentId: string;
		amount?: number;
	}): Promise<boolean> {
		const response = await this.request<TinkoffApiBaseResponse>("Cancel", {
			PaymentId: params.paymentId,
			Amount: params.amount !== undefined ? rubToKopek(params.amount) : undefined,
		});

		if (!response.Success) {
			logger.warn(
				{
					paymentId: params.paymentId,
					errorCode: response.ErrorCode,
					message: response.Message,
					details: response.Details,
				},
				"Tinkoff Cancel failed",
			);
			return false;
		}

		return true;
	}

	public async status(paymentId: string): Promise<{
		status: PaymentStatus;
		amount: number;
		orderId: string;
	}> {
		const response = await this.request<TinkoffGetStateResponse>("GetState", {
			PaymentId: paymentId,
		});

		if (!response.Success) {
			logger.warn(
				{
					paymentId,
					errorCode: response.ErrorCode,
					message: response.Message,
					details: response.Details,
					status: response.Status,
				},
				"Tinkoff GetState failed",
			);
			throw new Error("Tinkoff GetState failed");
		}

		const rawStatus = response.Status ? String(response.Status) : "REJECTED";
		const status = normalizeStatus(rawStatus);

		const amountKopek = response.Amount ?? 0;
		const orderId = response.OrderId ?? "";
		if (!orderId) {
			logger.warn({ paymentId, response }, "Tinkoff GetState missing OrderId");
		}

		return {
			status,
			amount: kopekToRub(amountKopek),
			orderId,
		};
	}

	public async addCard(userId: string): Promise<{ redirectUrl: string }> {
		const response = await this.request<TinkoffAddCardResponse>("AddCard", {
			CustomerKey: userId,
			CheckType: this.defaultAddCardCheckType,
		});

		if (!response.Success) {
			logger.warn(
				{
					userId,
					errorCode: response.ErrorCode,
					message: response.Message,
					details: response.Details,
				},
				"Tinkoff AddCard failed",
			);
			throw new Error("Tinkoff AddCard failed");
		}

		const redirectUrl = response.RedirectUrl ?? response.PaymentURL;
		if (!redirectUrl) {
			logger.error({ response }, "Tinkoff AddCard missing redirect URL");
			throw new Error("Tinkoff AddCard missing redirect URL");
		}

		return { redirectUrl };
	}

	public async getCards(userId: string): Promise<
		Array<{
			cardId: string;
			pan: string;
			expDate: string;
			rebillId: string;
		}>
	> {
		const response = await this.requestRaw("GetCardList", {
			CustomerKey: userId,
		});

		if (Array.isArray(response)) {
			const cards = response
				.map((item): TinkoffCardItem => (isPlainObject(item) ? item : {}))
				.map((item) => ({
					cardId: String(item.CardId ?? ""),
					pan: String(item.Pan ?? ""),
					expDate: String(item.ExpDate ?? ""),
					rebillId: String(item.RebillId ?? item.RebillID ?? ""),
				}))
				.filter((c) => c.cardId && c.pan && c.expDate && c.rebillId);

			return cards;
		}

		if (isPlainObject(response) && "Success" in response) {
			const base = response as Partial<TinkoffApiBaseResponse> & {
				Cards?: unknown;
			};

			if (base.Success === false) {
				logger.warn({ userId, response }, "Tinkoff GetCardList failed");
				return [];
			}

			const cardsRaw = base.Cards;
			if (!Array.isArray(cardsRaw)) return [];

			return cardsRaw
				.map((item): TinkoffCardItem => (isPlainObject(item) ? item : {}))
				.map((item) => ({
					cardId: String(item.CardId ?? ""),
					pan: String(item.Pan ?? ""),
					expDate: String(item.ExpDate ?? ""),
					rebillId: String(item.RebillId ?? item.RebillID ?? ""),
				}))
				.filter((c) => c.cardId && c.pan && c.expDate && c.rebillId);
		}

		logger.warn({ userId, response }, "Tinkoff GetCardList unexpected response");
		return [];
	}

	public async removeCard(params: {
		userId: string;
		cardId: string;
	}): Promise<boolean> {
		const response = await this.request<TinkoffApiBaseResponse>("RemoveCard", {
			CustomerKey: params.userId,
			CardId: params.cardId,
		});

		if (!response.Success) {
			logger.warn(
				{
					userId: params.userId,
					cardId: params.cardId,
					errorCode: response.ErrorCode,
					message: response.Message,
					details: response.Details,
				},
				"Tinkoff RemoveCard failed",
			);
			return false;
		}

		return true;
	}

	public verifyWebhook(body: Record<string, string>): boolean {
		const token = body.Token;
		if (!token) return false;

		const { Token: _ignored, ...rest } = body;
		const calculated = buildToken(rest, this.password);
		return calculated === token;
	}
}

const appOrigin = publicAppBaseUrl();

if (!appOrigin && process.env.NODE_ENV !== "test") {
	logger.warn(
		"NEXT_PUBLIC_APP_URL or APP_URL is empty — set it to your public origin (e.g. https://app.example.com) so Tinkoff Success/Fail URLs are valid",
	);
}

export const payment = new TinkoffPayment({
	terminalKey: process.env.TINKOFF_TERMINAL_KEY!,
	password: process.env.TINKOFF_PASSWORD!,
	baseUrl: "https://securepay.tinkoff.ru/v2",
	successUrl: `${appOrigin}${TINKOFF_RETURN_PATH}?status=success`,
	failUrl: `${appOrigin}${TINKOFF_RETURN_PATH}?status=fail`,
	notificationUrl: `${appOrigin}/api/webhooks/tinkoff`,
	defaultAddCardCheckType: "3DSHOLD",
});

