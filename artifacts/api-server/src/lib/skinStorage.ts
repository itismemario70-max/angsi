import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("App Storage is not configured.");
  return dir.replace(/\/+$/, "");
}

function getFile(objectPath: string) {
  if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(objectPath)) {
    throw new Error("Invalid staff skin path.");
  }
  const parts = privateDir().split("/").filter(Boolean);
  const bucketName = parts[0];
  const objectPrefix = parts.slice(1).join("/");
  const objectName = [objectPrefix, objectPath.slice("/objects/".length)]
    .filter(Boolean)
    .join("/");
  if (!bucketName || !objectName) throw new Error("Invalid App Storage path.");
  return storage.bucket(bucketName).file(objectName);
}

export async function createSkinUploadUrl() {
  const parts = privateDir().split("/").filter(Boolean);
  const bucketName = parts[0];
  const objectPrefix = parts.slice(1).join("/");
  if (!bucketName) throw new Error("Invalid App Storage bucket.");
  const objectName = [objectPrefix, "uploads", randomUUID()]
    .filter(Boolean)
    .join("/");
  const objectPath = `/objects/uploads/${objectName.split("/").at(-1)}`;
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Could not create an image upload URL.");
  const { signed_url: uploadURL } = (await response.json()) as {
    signed_url?: string;
  };
  if (!uploadURL) throw new Error("Storage did not return an upload URL.");
  return { uploadURL, objectPath };
}

export async function publishSkinImage(objectPath: string): Promise<string> {
  const file = getFile(objectPath);
  const [exists] = await file.exists();
  if (!exists) throw new Error("The uploaded image could not be found.");
  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType;
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType ?? "")) {
    throw new Error("Upload a PNG, JPG, or WebP image.");
  }
  if (Number(metadata.size ?? 0) > 5 * 1024 * 1024) {
    await file.delete();
    throw new Error("Staff images must be 5 MB or smaller.");
  }
  await file.setMetadata({
    metadata: {
      "custom:aclPolicy": JSON.stringify({
        owner: "legends-smp",
        visibility: "public",
      }),
    },
  });
  return `/api/storage${objectPath}`;
}

export async function readPublicSkin(objectPath: string) {
  const file = getFile(objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [metadata] = await file.getMetadata();
  const policy = metadata.metadata?.["custom:aclPolicy"];
  if (typeof policy !== "string") return null;
  try {
    if (JSON.parse(policy).visibility !== "public") return null;
  } catch {
    return null;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(metadata.contentType ?? "")) {
    return null;
  }
  return { file, metadata };
}
