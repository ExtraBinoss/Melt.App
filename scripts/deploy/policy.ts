/** GitHub-provided identity, never author/committer strings from a Git object. */
export function assertOwnerRun(context: Record<string, string | undefined>, production = false) {
  if (
    context.GITHUB_REPOSITORY !== "ExtraBinoss/Melt.App" ||
    context.GITHUB_REPOSITORY_ID !== "1436787551" ||
    context.GITHUB_ACTOR_ID !== "113912449" ||
    context.GITHUB_ACTOR !== "ExtraBinoss" ||
    context.GITHUB_TRIGGERING_ACTOR !== "ExtraBinoss"
  )
    throw Error("Only an authenticated ExtraBinoss run in ExtraBinoss/Melt.App is allowed.");
  if (!["push", "workflow_dispatch"].includes(context.GITHUB_EVENT_NAME ?? ""))
    throw Error("CI requires an owner push or manual run.");
  if (production && context.GITHUB_REF !== "refs/heads/main")
    throw Error("Production requires the main branch.");
  if (!/^[a-f0-9]{40}$/.test(context.GITHUB_SHA ?? ""))
    throw Error("An exact GitHub event commit is required.");
}

if (import.meta.main) {
  assertOwnerRun(process.env, process.argv.includes("--production"));
  console.log("Authenticated repository, owner and event checks passed.");
}
