import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { MediaPlayer } from "../../../../src/components/shared/player/MediaPlayer";
import { createSliderValue } from "../../../../src/components/ui/slider-value";
import { playerTime, parsePlayerTime } from "../../../../src/components/shared/player/clock";
beforeEach(() => {
  void i18n.changeLanguage("en");
});
test("clock frames stay local; keyboard scrubbing pauses, cancels and restores playback without committing a late gesture to a new owner", () => {
  const position = createSliderValue([0.25]),
    playing = vi.fn(),
    seek = vi.fn((value: number) => position.set([value]));
  const first = {},
    second = {};
  let renders = 0;
  function Host({ identity }: { identity: object }) {
    renders++;
    return (
      <MediaPlayer
        identity={identity}
        position={position}
        duration={5}
        playing
        onPlayingChange={playing}
        onSeek={seek}
      />
    );
  }
  const view = render(<Host identity={first} />);
  act(() => position.set([1.2]));
  expect(screen.getByRole("textbox", { name: "Start time" })).toHaveValue("0:01.2");
  expect(document.querySelector("[data-player-time]")).toHaveAttribute("data-time", "1.2");
  expect(renders).toBe(1);
  const slider = screen.getByRole("slider", { name: "Preview time" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(playing).toHaveBeenCalledWith(false);
  expect(seek).toHaveBeenLastCalledWith(1.201);
  fireEvent.keyDown(slider, { key: "Escape" });
  expect(seek).toHaveBeenLastCalledWith(1.2);
  expect(playing).toHaveBeenLastCalledWith(true);
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  view.rerender(<Host identity={second} />);
  playing.mockClear();
  seek.mockClear();
  fireEvent.keyUp(slider, { key: "ArrowRight" });
  expect(playing).not.toHaveBeenCalled();
  expect(seek).not.toHaveBeenCalled();
  expect(playerTime(3661.29)).toBe("61:01.2");
  expect(playerTime(Number.NaN)).toBe("0:00.0");
});
test("volume popover restores the last audible level and updates its percent output on reopening", () => {
  const position = createSliderValue([0]),
    value = createSliderValue([0]);
  const setVolume = vi.fn((percent: number) => value.set([percent]));
  render(
    <MediaPlayer
      position={position}
      duration={5}
      playing={false}
      onPlayingChange={vi.fn()}
      onSeek={vi.fn()}
      audio={{ value, setVolume }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Volume" }));
  fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
  expect(setVolume).toHaveBeenLastCalledWith(100);
  const slider = screen.getByRole("slider", { name: "Volume" });
  fireEvent.keyDown(slider, { key: "Home" });
  expect(setVolume).toHaveBeenLastCalledWith(0);
  act(() => value.set([37]));
  expect(screen.getByText("37%")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Mute" }));
  fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
  expect(setVolume).toHaveBeenLastCalledWith(37);
});

test("time drafts survive frame updates, commit once, clamp and reject a retired owner", () => {
  const position = createSliderValue([0]);
  const seek = vi.fn((time: number) => position.set([time]));
  const playing = vi.fn();
  const first = {},
    second = {};
  const view = render(
    <MediaPlayer
      position={position}
      duration={5}
      playing={false}
      identity={first}
      onSeek={seek}
      onPlayingChange={playing}
    />,
  );
  const input = screen.getByRole("textbox", { name: "Start time" });
  fireEvent.focus(input);
  act(() => position.set([0.765]));
  fireEvent.blur(input);
  expect(seek).not.toHaveBeenCalled();
  expect(playing).not.toHaveBeenCalled();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "0:02.75" } });
  act(() => position.set([1]));
  expect(input).toHaveValue("0:02.75");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(seek).toHaveBeenCalledExactlyOnceWith(2.75);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "99" } });
  fireEvent.blur(input);
  expect(seek).toHaveBeenLastCalledWith(5);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "3" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(seek).toHaveBeenCalledTimes(2);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "2" } });
  view.rerender(
    <MediaPlayer
      position={position}
      duration={5}
      playing={false}
      identity={second}
      onSeek={seek}
      onPlayingChange={playing}
    />,
  );
  fireEvent.blur(input);
  expect(seek).toHaveBeenCalledTimes(2);
  expect(parsePlayerTime("1:02:03.5")).toBe(3723.5);
  for (const text of ["-1", "0:60", "a", "", "0.5:20", "Infinity"])
    expect(parsePlayerTime(text)).toBeNull();
});
