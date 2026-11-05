import { expect, it, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import {
  publishEditorNotice,
  publishNoticeActivity,
  subscribeEditorNotices,
  subscribeNoticeActivity,
} from "../../../src/components/notifications/source";

it("isolates inserted-object feedback and competing feedback slots by engine and removes subscriptions", () => {
  const first = new EditorEngine(),
    second = new EditorEngine(),
    notice = { message: "Sphere added", error: false },
    notices = vi.fn(),
    activity = vi.fn(),
    other = vi.fn(),
    stopNotice = subscribeEditorNotices(first, notices),
    stopActivity = subscribeNoticeActivity(first, activity),
    stopOther = subscribeEditorNotices(second, other);
  publishEditorNotice(first, notice);
  publishNoticeActivity(first, "history");
  expect(notices).toHaveBeenCalledExactlyOnceWith(notice);
  expect(activity).toHaveBeenCalledExactlyOnceWith("history");
  expect(other).not.toHaveBeenCalled();
  stopNotice();
  stopActivity();
  stopOther();
  publishEditorNotice(first, notice);
  publishNoticeActivity(first, "editor");
  expect(notices).toHaveBeenCalledOnce();
  expect(activity).toHaveBeenCalledOnce();
});
