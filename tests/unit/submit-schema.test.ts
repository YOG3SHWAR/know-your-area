import { describe, expect, it } from "vitest";
import { CATEGORIES, submissionSchema } from "@/types/complaint";

const validPayload = {
  category: "pothole" as const,
  lat: 12.9716,
  lng: 77.5946,
  accuracy: 15,
  photoKey: "complaints/KYA-7F3XABC.jpg",
};

describe("submissionSchema", () => {
  it("accepts each of the 5 fixed categories", () => {
    for (const { value } of CATEGORIES) {
      const result = submissionSchema.safeParse({ ...validPayload, category: value });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a 6th, unlisted category", () => {
    const result = submissionSchema.safeParse({ ...validPayload, category: "sewage" });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates outside India's bounding box", () => {
    // lat 45 / lng 120 — well outside India (RESEARCH-verified bounding box)
    expect(submissionSchema.safeParse({ ...validPayload, lat: 45, lng: 120 }).success).toBe(
      false,
    );
    expect(submissionSchema.safeParse({ ...validPayload, lat: 5, lng: 77 }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...validPayload, lat: 12, lng: 98 }).success).toBe(false);
  });

  it("accepts coordinates at the India bounding-box edges", () => {
    expect(submissionSchema.safeParse({ ...validPayload, lat: 6.0, lng: 68.0 }).success).toBe(
      true,
    );
    expect(submissionSchema.safeParse({ ...validPayload, lat: 37.5, lng: 97.5 }).success).toBe(
      true,
    );
  });

  it("rejects a negative accuracy", () => {
    const result = submissionSchema.safeParse({ ...validPayload, accuracy: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed photoKey", () => {
    expect(
      submissionSchema.safeParse({ ...validPayload, photoKey: "not-a-valid-key.png" }).success,
    ).toBe(false);
    expect(
      submissionSchema.safeParse({ ...validPayload, photoKey: "complaints/random.jpg" }).success,
    ).toBe(false);
  });

  it("accepts a well-formed photoKey with jpg, jpeg, or webp extension", () => {
    for (const ext of ["jpg", "jpeg", "webp"]) {
      const result = submissionSchema.safeParse({
        ...validPayload,
        photoKey: `complaints/KYA-7F3XABC.${ext}`,
      });
      expect(result.success).toBe(true);
    }
  });
});
