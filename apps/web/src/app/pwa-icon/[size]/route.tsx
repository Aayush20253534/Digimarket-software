import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const revalidate = 86400;

// All installed-app icon sizes use the same updated, white-A AmplifyWorld artwork.
const permitted = new Set(["180", "192", "512"]);
const logoSource = readFile(join(process.cwd(), "public", "brand", "amplifyworld-pwa-logo.jpg"));

export function generateStaticParams() {
  return [...permitted].map(size => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: rawSize } = await params;
  if (!permitted.has(rawSize)) return new Response("Not found", { status: 404 });

  const size = Number(rawSize);
  const imageData = "data:image/jpeg;base64," + (await logoSource).toString("base64");
  // Android's maskable icon needs a safe zone; Apple/regular icons fill the square.
  const iconSize = rawSize === "512" ? Math.round(size * 0.78) : size;

  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "#0B061B",
    }}>
      <img src={imageData} alt="" width={iconSize} height={iconSize}
        style={{ width: iconSize, height: iconSize, objectFit: "contain" }} />
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
