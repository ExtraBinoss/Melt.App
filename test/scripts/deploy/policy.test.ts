import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { resolve } from "node:path";
import { assertOwnerRun } from "../../../scripts/deploy/policy";

const owner = {
  GITHUB_REPOSITORY: "ExtraBinoss/Melt.App",
  GITHUB_REPOSITORY_ID: "1436787551",
  GITHUB_ACTOR_ID: "113912449",
  GITHUB_ACTOR: "ExtraBinoss",
  GITHUB_TRIGGERING_ACTOR: "ExtraBinoss",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "push",
  GITHUB_SHA: "a".repeat(40),
};
test("only the authenticated owner may publish main through CI, including manual runs", () => {
  expect(() => assertOwnerRun(owner, true)).not.toThrow();
  expect(() =>
    assertOwnerRun({ ...owner, GITHUB_EVENT_NAME: "workflow_dispatch" }, true),
  ).not.toThrow();
});
test.each([
  { GITHUB_ACTOR_ID: "999", GITHUB_ACTOR: "ExtraBinoss", GIT_AUTHOR_NAME: "ExtraBinoss" },
  { GITHUB_TRIGGERING_ACTOR: "contributor" },
  { GITHUB_REPOSITORY_ID: "999" },
  { GITHUB_REPOSITORY: "contributor/Melt.App" },
  { GITHUB_REF: "refs/heads/contributor" },
  { GITHUB_EVENT_NAME: "pull_request" },
  { GITHUB_SHA: "main" },
])("forged authors, forks, contributor reruns and non-production refs are denied: %j", (change) => {
  expect(() => assertOwnerRun({ ...owner, ...change }, true)).toThrow();
});
test("CI guards and production secrets remain protected independently of Git commit author fields", () => {
  const workflow = parse(readFileSync(resolve(".github/workflows/quality.yml"), "utf8")) as {
    on: Record<string, unknown>;
    jobs: Record<
      string,
      {
        if: string;
        environment?: { name: string };
        needs?: string;
        steps: { env?: Record<string, string>; run?: string }[];
      }
    >;
  };
  for (const name of ["verify", "deploy"]) {
    expect(workflow.jobs[name]!.if).toContain("github.actor_id == '113912449'");
    expect(workflow.jobs[name]!.if).toContain("github.triggering_actor == 'ExtraBinoss'");
    expect(workflow.jobs[name]!.if).toContain("github.repository_id == '1436787551'");
  }
  expect(workflow.jobs.deploy!.needs).toBe("verify");
  expect(workflow.jobs.deploy!.environment?.name).toBe("cloudflare-production");
  expect(workflow.jobs.deploy!.if).toContain("github.ref == 'refs/heads/main'");
  expect(workflow.on).not.toHaveProperty("pull_request_target");
  expect(workflow.on).not.toHaveProperty("pull_request");
  expect(
    workflow.jobs.verify!.steps.some((step) =>
      JSON.stringify(step).includes("CLOUDFLARE_API_TOKEN"),
    ),
  ).toBe(false);
  const secretSteps = workflow.jobs.deploy!.steps.filter((step) => step.env?.CLOUDFLARE_API_TOKEN);
  expect(secretSteps).toHaveLength(1);
  expect(secretSteps[0]!.run).toContain("wrangler deploy --env production");
});
