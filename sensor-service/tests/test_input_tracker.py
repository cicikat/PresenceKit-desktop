"""
Pure-logic tests for sense.input_tracker._compute_edit_hint, plus a
white-box check that InputTracker.collect() resets its counters and wires
those into the edit_hint classification.
"""
import time

from sense.input_tracker import InputTracker, _compute_edit_hint


def test_no_activity_is_idle():
    assert _compute_edit_hint(keystrokes=0, backspaces=0, idle_s=5, window_s=30) == "idle"


def test_long_idle_overrides_activity():
    # idle_s >= max(60, window_s) wins even if there was earlier activity in-window
    assert _compute_edit_hint(keystrokes=50, backspaces=0, idle_s=90, window_s=30) == "idle"


def test_high_backspace_ratio_is_deleting():
    # 40/100 = 0.4 > 0.35 threshold
    assert _compute_edit_hint(keystrokes=60, backspaces=40, idle_s=0, window_s=30) == "deleting"


def test_backspace_ratio_at_threshold_boundary_is_not_deleting():
    # 35/100 = 0.35 exactly; the strict `>` check means this falls through to
    # the typing-speed branch instead of "deleting".
    result = _compute_edit_hint(keystrokes=65, backspaces=35, idle_s=0, window_s=30)
    assert result == "typing_long"


def test_fast_typing_is_typing_long():
    # 90 keys over 30s effective window = 3 keys/sec > 1.5 threshold
    assert _compute_edit_hint(keystrokes=90, backspaces=0, idle_s=0, window_s=30) == "typing_long"


def test_moderate_activity_is_editing():
    # 10 keys over 30s = 0.33 keys/sec, well under the typing_long threshold
    assert _compute_edit_hint(keystrokes=10, backspaces=0, idle_s=0, window_s=30) == "editing"


def test_collect_resets_counters_and_reports_snapshot():
    tracker = InputTracker()
    tracker._keystrokes = 5
    tracker._backspaces = 0
    tracker._mouse_clicks = 3
    tracker._mouse_distance_px = 120
    tracker._last_event_at = time.time()

    result = tracker.collect(window_seconds=30)

    assert result["keystrokes"] == 5
    assert result["mouse_clicks"] == 3
    assert result["mouse_distance_px"] == 120
    assert result["idle_seconds"] == 0

    # Counters must be zeroed for the next window (duplicate-read tolerance).
    second = tracker.collect(window_seconds=30)
    assert second["keystrokes"] == 0
    assert second["mouse_clicks"] == 0
    assert second["mouse_distance_px"] == 0


def test_collect_caps_mouse_distance_at_999999():
    tracker = InputTracker()
    tracker._mouse_distance_px = 5_000_000
    result = tracker.collect(window_seconds=30)
    assert result["mouse_distance_px"] == 999_999
