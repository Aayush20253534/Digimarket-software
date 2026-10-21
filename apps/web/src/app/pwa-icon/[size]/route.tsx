import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const revalidate = 86400;

// Reuse the existing AmplifyWorld mark instead of inventing a new app identity.
const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="112" viewBox="0 0 144 112">
<defs><linearGradient id="amplify" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#6516FF"/><stop offset=".48" stop-color="#A020FF"/><stop offset="1" stop-color="#F037DB"/></linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#D8D3E8"/></linearGradient></defs>
<path d="M4 102 49 21a11 11 0 0 1 19 0l28 48H73L58 42 25 102Z" fill="url(#metal)"/>
<path d="m41 76 12-18h31l11 18z" fill="url(#metal)"/>
<path d="m79 73 17 24a10 10 0 0 0 17-1l17-30-12-16-15 26-14-19Z" fill="url(#amplify)"/>
<path d="M110 73 137 13l-5 30-18-9-29 54-12-18L109 39Z" fill="url(#amplify)"/>
<path d="m104 23 36-17-5 40Z" fill="#E72EEA"/>
</svg>`;
const logoData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(mark);
const permitted = new Set(["180", "192", "512"]);

export function generateStaticParams() {
  return [...permitted].map(size => ({ size }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: rawSize } = await params;
  if (!permitted.has(rawSize)) return new Response("Not found", { status: 404 });
  const size = Number(rawSize);
  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #201033 0%, #10091C 66%, #1A0C2A 100%)",
      borderRadius: Math.round(size * 0.21),
    }}>
      <img src={logoData} alt="" width={Math.round(size * .69)} height={Math.round(size * .58)}/>
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
