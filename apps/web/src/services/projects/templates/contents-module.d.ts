declare module "virtual:template-contents" {
  import type { ProjectContentTag } from "@musart/core";
  const contents: Readonly<Record<string, readonly ProjectContentTag[]>>;
  export default contents;
}
