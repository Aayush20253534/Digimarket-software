import {describe,expect,it} from "vitest";
import {fallbackDraft,isGoogleReviewUrl,reviewProviderConfiguration} from "./routes";

describe("official Google review URL validation",()=>{
 it("accepts known review links",()=>{
  expect(isGoogleReviewUrl("https://g.page/r/Abcd1234/review")).toBe(true);
  expect(isGoogleReviewUrl("https://search.google.com/local/writereview?placeid=ChIJ1234")).toBe(true);
  expect(isGoogleReviewUrl("https://maps.app.goo.gl/aB12cd")).toBe(true);
 });
 it("rejects redirects or untrusted hosts",()=>{
  expect(isGoogleReviewUrl("https://google.com.evil.test/maps")).toBe(false);
  expect(isGoogleReviewUrl("javascript:alert(1)")).toBe(false);
  expect(isGoogleReviewUrl("https://evil.example/?q=google.com")).toBe(false);
  expect(isGoogleReviewUrl("http://g.page/r/abc/review")).toBe(false);
  expect(isGoogleReviewUrl("https://search.google.com/local/writereview")).toBe(false);
 });
});
describe("fallback draft generator",()=>{
 it("varies across successive visits without inventing praise",()=>{
  const a=fallbackDraft("Demo Cafe","","English",1);
  const b=fallbackDraft("Demo Cafe","","English",2);
  expect(a).not.toBe(b);
  expect(a).toContain("[");
  expect(b).not.toMatch(/five star|best ever/i);
 });
 it("offers supported languages",()=>{
  expect(fallbackDraft("Demo","","Hindi",1)).toMatch(/\[/);
  expect(fallbackDraft("Demo","","Hinglish",1)).toContain("experience");
 });
});

describe("AI provider selection",()=>{
 it("prioritizes Groq over OpenAI",()=>{
  const choice=reviewProviderConfiguration({GROQ_API_KEY:"gsk_sample",OPENAI_API_KEY:"sk_sample"});
  expect(choice?.provider).toBe("groq");
  expect(choice?.model).toBe("openai/gpt-oss-20b");
  expect(choice?.endpoint).toBe("https://api.groq.com/openai/v1/chat/completions");
 });
 it("uses OpenAI only if Groq is not configured",()=>{
  expect(reviewProviderConfiguration({OPENAI_API_KEY:"sk_sample"})?.provider).toBe("openai");
  expect(reviewProviderConfiguration({}) ).toBeNull();
 });
});
