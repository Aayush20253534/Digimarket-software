import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import type { AuthService } from "../auth/service";
import { LeadsService } from "../leads/service";

// VGraple signs the ORIGINAL JSON bytes. This route must run before express.json().
export function validVGrapleSignature(
  raw: Buffer, legacyHeader: string | undefined, signedHeader: string | undefined,
  secret: string, nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret.startsWith("whsec_") || secret.length < 24) return false;
  if (signedHeader) {
    const match = /^t=(\d{9,12}),\s*v1=([0-9a-f]{64})$/i.exec(signedHeader);
    if (!match) return false;
    const timestamp = Number(match[1]);
    if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
    const expected = createHmac("sha256", secret).update(match[1]).update(".").update(raw).digest();
    const received = Buffer.from(match[2], "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
  // Backward-compatible signature documented by VGraple for older deliveries.
  if (!/^sha256=[0-9a-f]{64}$/i.test(legacyHeader ?? "")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const received = Buffer.from(legacyHeader!.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type ObjectMap = Record<string, unknown>;
const object = (value: unknown): ObjectMap | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectMap : null;

export function inboundVGraplePhone(event: unknown, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  const envelope = object(event);
  if (!envelope || envelope.type !== "message.received" || envelope._test === true) return null;
  const data = object(envelope.data);
  if (!data || data._test === true || !Number.isSafeInteger(envelope.created) ||
    Math.abs(nowSeconds - (envelope.created as number)) > 3600) return null;
  const message = object(data.message), contact = object(data.contact);
  if (!message || !contact || message.direction !== "inbound" || message.channel !== "whatsapp") return null;

  // Never add group chats, broadcast messages, forwarded participant identifiers or tests.
  for (const source of [data, message]) {
    if (source.group_id != null || source.groupId != null || source.participant != null ||
      source.participants != null || source.chat_type === "group" ||
      source.conversation_type === "group" || source.recipient_type === "group") return null;
    for (const key of ["chat_id", "remoteJid", "from", "to"]) {
      const value = source[key];
      if (typeof value === "string" && (/@g\.us$/i.test(value) || /@broadcast$/i.test(value))) return null;
    }
  }

  // Ignore history imports or old synced messages, even if their event envelope was just created.
  for (const field of [message.wa_timestamp, message.created_at]) {
    if (field == null) continue;
    if (typeof field !== "string") return null;
    const timestamp = Date.parse(field);
    if (!Number.isFinite(timestamp) || Math.abs(nowSeconds * 1000 - timestamp) > 3600_000) return null;
  }

  const rawPhone = contact.phone;
  if (typeof rawPhone !== "string" || !/^\+?[0-9][0-9\s().-]{5,24}$/.test(rawPhone.trim())) return null;
  const digits = rawPhone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? "+" + digits : null;
}

function configured() {
  const secret = process.env.VGRAPLE_WEBHOOK_SECRET ?? "";
  const organizationId = process.env.VGRAPLE_ORGANIZATION_ID ?? process.env.WHATSAPP_ORGANIZATION_ID ?? "";
  const createdById = process.env.VGRAPLE_CREATED_BY_USER_ID ?? process.env.WHATSAPP_CREATED_BY_USER_ID ?? "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!secret.startsWith("whsec_") || secret.length < 24 ||
    !uuid.test(organizationId) || !uuid.test(createdById)) return null;
  return { secret, organizationId, createdById };
}

export function registerVGrapleWebhook(app: Express, auth: AuthService) {
  const leads = new LeadsService(auth.database);
  const path = "/api/v1/integrations/vgraple/webhook";
  app.post(path, express.raw({ type: "application/json", limit: "128kb" }), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const config = configured();
    if (!config) return res.status(503).json({
      error: { code: "VGRAPLE_UNCONFIGURED", message: "VGraple webhook is not configured" },
    });
    if (!Buffer.isBuffer(req.body) ||
      !validVGrapleSignature(req.body, req.get("x-signature-256"), req.get("x-webhook-signature"), config.secret)) {
      return res.status(401).json({
        error: { code: "WEBHOOK_UNAUTHORIZED", message: "Invalid webhook signature" },
      });
    }
    let event: unknown;
    try { event = JSON.parse(req.body.toString("utf8")); }
    catch { return res.status(400).json({ error: { code: "INVALID_PAYLOAD", message: "Invalid JSON" } }); }
    const phone = inboundVGraplePhone(event);
    if (phone) await leads.ingestWhatsApp(config.organizationId, config.createdById, phone);
    // Also acknowledge valid test or irrelevant events without creating any leads.
    return res.status(200).json({ data: { received: true, processed: phone ? 1 : 0 } });
  });
}
