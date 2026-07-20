const DEFAULT_ANDROID_PACKAGE_ID = "com.glimpsechat.app";
const SHA256_FINGERPRINT = /^([0-9a-f]{2}:){31}[0-9a-f]{2}$/i;

export const dynamic = "force-dynamic";

export function GET() {
  const packageName = process.env.ANDROID_TWA_PACKAGE_ID?.trim() || DEFAULT_ANDROID_PACKAGE_ID;
  const fingerprints = (process.env.ANDROID_TWA_SHA256_CERT_FINGERPRINTS || "")
    .split(/[;,\n]/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => SHA256_FINGERPRINT.test(value));

  const body = fingerprints.length
    ? [{
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints
        }
      }]
    : [];

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Glimpse-Assetlinks-Status": fingerprints.length ? "configured" : "missing-fingerprint"
    }
  });
}
