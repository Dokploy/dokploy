import { createHash } from "node:crypto";

import { nanoid } from "nanoid";

import { payment } from "./payment";

export interface TinkoffPaymentInit {
	TerminalKey: string;
	Amount: number;
	OrderId: string;
	Description: string;
	CustomerKey: string;
	Recurrent?: "Y" | "N";
	SuccessURL: string;
	FailURL: string;
	NotificationURL: string;
}

export interface TinkoffChargeRequest {
	TerminalKey: string;
	PaymentId: string;
	RebillId: string;
}

type PaymentStatus =
	| "NEW"
	| "AUTHORIZED"
	| "CONFIRMED"
	| "REJECTED"
	| "REFUNDED"
	| "CANCELED";

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (!value || typeof value !== "object") return false;
	if (Array.isArray(value)) return false;
	return true;
};

const buildToken = (params: Record<string, unknown>, password: string): string => {
	const flat: Record<string, string> = {};

	for (const [key, value] of Object.entries(params)) {
		if (key === "Token") continue;
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

/**
 * generateToken(params) — SHA256 подпись запроса
 * - Берёт все поля кроме Token
 * - Добавляет Password
 * - Сортирует ключи по алфавиту
 * - Конкатенирует значения
 * - SHA256 хеш
 */
export const generateToken = (params: Record<string, unknown>): string => {
	return buildToken(params, process.env.TINKOFF_PASSWORD ?? "");
};

const KOPEK_IN_RUB = 100;

const kopekToRub = (amountKopek: number): number => amountKopek / KOPEK_IN_RUB;
const rubToKopek = (amountRub: number): number =>
	Math.round(amountRub * KOPEK_IN_RUB);

const generateOrderId = (): string => nanoid();

/**
 * initPayment(params) → { PaymentURL, PaymentId }
 * - POST /Init
 * - Recurrent: 'Y' для подписок
 * - CustomerKey: userId
 */
export const initPayment = async (
	params: TinkoffPaymentInit,
): Promise<{ PaymentURL: string; PaymentId: string }> => {
	const { paymentUrl, paymentId } = await payment.init({
		amount: kopekToRub(params.Amount),
		orderId: params.OrderId,
		description: params.Description,
		userId: params.CustomerKey,
		successUrl: params.SuccessURL,
		failUrl: params.FailURL,
		recurrent: params.Recurrent === "Y",
	});

	return { PaymentURL: paymentUrl, PaymentId: paymentId };
};

/**
 * confirmPayment(paymentId) → boolean
 * - POST /Confirm
 */
export const confirmPayment = async (paymentId: string): Promise<boolean> => {
	return await payment.confirm(paymentId);
};

/**
 * chargeRecurrent({ paymentId, rebillId }) → PaymentStatus
 * - POST /Init (новый платёж)
 * - POST /Charge
 */
export const chargeRecurrent = async (params: {
	userId: string;
	amount: number; // копейки
	description: string;
	rebillId: string;
}): Promise<{
	status: PaymentStatus;
	paymentId: string;
	failureKind?: "REJECTED" | "UNKNOWN";
}> => {
	const { paymentId, failureKind } = await payment.charge({
		userId: params.userId,
		amount: kopekToRub(params.amount),
		description: params.description,
		rebillId: params.rebillId,
	});

	if (failureKind === "REJECTED") {
		return { status: "REJECTED", paymentId, failureKind };
	}
	if (failureKind === "UNKNOWN") {
		return { status: "REJECTED", paymentId, failureKind };
	}

	const state = await payment.status(paymentId);
	return { status: state.status, paymentId };
};

/**
 * cancelPayment(paymentId) → boolean
 * - POST /Cancel
 */
export const cancelPayment = async (paymentId: string): Promise<boolean> => {
	return await payment.cancel({ paymentId });
};

/**
 * getPaymentStatus(paymentId) → PaymentStatus
 * - POST /GetState
 */
export const getPaymentStatus = async (
	paymentId: string,
): Promise<PaymentStatus> => {
	const state = await payment.status(paymentId);
	return state.status;
};

/**
 * verifyWebhookToken(body) → boolean
 * - Проверка подписи входящего вебхука
 */
export const verifyWebhookToken = (body: Record<string, string>): boolean => {
	return payment.verifyWebhook(body);
};

export const createOrderId = (): string => generateOrderId();

export const toKopekAmount = (amountRub: number): number => rubToKopek(amountRub);

