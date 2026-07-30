import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors tests/unit/submit-complaint-sanitization.test.ts's mock-then-
// dynamic-import shape: the route imports @/lib/r2, @/lib/auth, and
// next/headers, each of which would otherwise require live env vars (R2
// credentials, Better Auth/Google env vars) to instantiate. Mock all of
// them so importing the Route Handler never touches that chain.
const presignPhotoUploadMock = vi.fn().mockResolvedValue("https://r2.example/signed-put-url");
vi.mock("@/lib/r2", () => ({
  presignPhotoUpload: presignPhotoUploadMock,
}));

const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/upload-url session gate", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    presignPhotoUploadMock.mockClear();
  });

  it("returns 401 { error: 'unauthorized' } when no session is present, without minting a URL", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/upload-url/route");

    const res = await POST(jsonRequest({ ext: "jpg" }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(presignPhotoUploadMock).not.toHaveBeenCalled();
  });

  it("returns 200 with a url and key for an authenticated caller with a valid ext", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "test-user" } });
    const { POST } = await import("@/app/api/upload-url/route");

    const res = await POST(jsonRequest({ ext: "jpg" }));

    expect(res.status).toBe(200);
    const body: { url: string; key: string } = await res.json();
    expect(body.url).toBe("https://r2.example/signed-put-url");
    expect(body.key).toMatch(/^complaints\/.+\.jpg$/);
  });
});
