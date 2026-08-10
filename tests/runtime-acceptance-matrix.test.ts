import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type AcceptanceCase = {
  id: string;
  area: string;
  status: "not-run" | "passed" | "failed" | "blocked";
  evidence: string;
};

type AcceptanceMatrix = {
  schema_version: string;
  status_summary: "not-run" | "partial" | "passed" | "failed";
  evidence_level: string;
  environment: Record<string, string>;
  cases: AcceptanceCase[];
};

function readMatrix(): AcceptanceMatrix {
  return JSON.parse(
    readFileSync(resolve("docs/runtime-acceptance-matrix.json"), "utf8"),
  ) as AcceptanceMatrix;
}

describe("desktop runtime acceptance matrix", () => {
  it("is versioned and keeps automated and real-runtime evidence distinct", () => {
    const matrix = readMatrix();

    expect(matrix.schema_version).toBe("1.0.0");
    expect(matrix.status_summary).toBe("partial");
    expect(matrix.evidence_level).toBe("automated_only");
    expect(matrix.cases.length).toBeGreaterThan(0);

    for (const item of matrix.cases) {
      expect(item.id).not.toBe("");
      expect(["not-run", "passed", "failed", "blocked"]).toContain(item.status);
      if (item.area !== "automated" && item.status === "passed") {
        expect(matrix.environment.desktop_commit).not.toBe("");
        expect(matrix.environment.os).not.toBe("");
        expect(matrix.environment.executed_at).not.toBe("");
        expect(item.evidence).not.toBe("");
      }
    }
  });
});
