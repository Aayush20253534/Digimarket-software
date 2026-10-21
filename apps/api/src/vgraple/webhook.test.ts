import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inboundVGraplePhone, validVGrapleSignature } from "./webhook";

const nowSeconds = 1_800_000_000;
const secret = "whsec_" + "s".repeat(40);
const inbound = {
  id: "evt_123", type: "message.received", created: nowSeconds,
  data: {
    message: { id: "msg_123", direction: "inbound", channel: "whatsapp",
      wa_timestamp: new Date(nowSeconds * 1000).toISOString(), body: "sensitive: never store" },
    contact: { id: "con_123", phone: "+91 98765 43210" },
    conversation_id: "conv_123",
  },
};

describe("VGraple signed inbound WhatsApp lead webhook", () => {
  it("verifies exact raw bytes with legacy X-Signature-256, rejecting tampering", () => {
    const raw = Buffer.from(JSON.stringify(inbound));
    const header = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    expect(validVGrapleSignature(raw, header, undefined, secret)).toBe(true);
    expect(validVGrapleSignature(Buffer.from("{}"), header, undefined, secret)).toBe(false);
    expect(validVGrapleSignature(raw, "sha256=0", undefined, secret)).toBe(false);
    expect(validVGrapleSignature(raw, undefined, undefined, secret)).toBe(false);
    expect(validVGrapleSignature(raw, header, undefined, "wrong-secret")).toBe(false);
  });
  it("prefers the timestamped signature and rejects stale or forged signatures", () => {
    const raw = Buffer.from(JSON.stringify(inbound));
    const digest = (t: number) => createHmac("sha256", secret)
      .update(String(t)).update(".").update(raw).digest("hex");
    const recent = "t=" + nowSeconds + ",v1=" + digest(nowSeconds);
    const old = "t=" + (nowSeconds - 301) + ",v1=" + digest(nowSeconds - 301);
    expect(validVGrapleSignature(raw, undefined, recent, secret, nowSeconds)).toBe(true);
    expect(validVGrapleSignature(raw, undefined, old, secret, nowSeconds)).toBe(false);
    expect(validVGrapleSignature(raw, undefined, "t=invalid,v1=bad", secret, nowSeconds)).toBe(false);
    const legacy = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    expect(validVGrapleSignature(raw, legacy, old, secret, nowSeconds)).toBe(false);
  });
  it("extracts only the sender phone, never message contents", () => {
    expect(inboundVGraplePhone(inbound, nowSeconds)).toBe("+919876543210");
  });
  it("ignores test deliveries, outbound messages and non-WhatsApp channels", () => {
    expect(inboundVGraplePhone({ ...inbound, _test: true }, nowSeconds)).toBeNull();
    expect(inboundVGraplePhone({ ...inbound, data: { ...inbound.data, _test: true } }, nowSeconds)).toBeNull();
    expect(inboundVGraplePhone({ ...inbound, type: "contact.created" }, nowSeconds)).toBeNull();
    expect(inboundVGraplePhone({ ...inbound, data: { ...inbound.data, message: {
      ...inbound.data.message, direction: "outbound" } } }, nowSeconds)).toBeNull();
    expect(inboundVGraplePhone({ ...inbound, data: { ...inbound.data, message: {
      ...inbound.data.message, channel: "instagram" } } }, nowSeconds)).toBeNull();
  });
  it("rejects groups, malformed sender numbers, and old imported chat history", () => {
    expect(inboundVGraplePhone({ ...inbound, data: { ...inbound.data, message: {
      ...inbound.data.message, group_id: "group-42" } } }, nowSeconds)).toBeNull();
    expect(inboundVGraplePhone({ ...inbound, data: { ...inbound.data,
      contact: { phone: "120363000@g.us" } } }, nowSeconds)).toBeNull();
    expect(inboundVGraplePhone({ ...inbound, created: nowSeconds - 7_200 }, nowSeconds)).toBeNull();
    expect(inboundVGraplePhone({ ...inbound, data: { ...inbound.data, message: {
      ...inbound.data.message, wa_timestamp: new Date((nowSeconds - 7_200) * 1000).toISOString() } } }, nowSeconds)).toBeNull();
  });
});
