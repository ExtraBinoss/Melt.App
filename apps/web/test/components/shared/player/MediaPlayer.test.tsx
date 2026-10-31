import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { MediaPlayer } from "../../../../src/components/shared/player/MediaPlayer";
import { createSliderValue } from "../../../../src/components/ui/slider-value";
import { playerTime } from "../../../../src/components/shared/player/clock";
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
  expect(screen.getByLabelText("Playback time")).toHaveTextContent("0:01.2 / 0:05.0");
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
