/** Modified activations belong to the browser, including native new-tab/window gestures. */
export function isPlainPrimaryClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
export const dashboardHref = `${import.meta.env.BASE_URL}dashboard`;
/** Dialog triggers retain button keyboard semantics while their href supports browser navigation. */
export function dialogLinkKeyDown(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault(): void;
  currentTarget: { click(): void };
}) {
  if (event.key === " " && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    event.currentTarget.click();
  }
}
