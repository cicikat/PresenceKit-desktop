"""
Pure state-machine tests for sense.activity_tracker.ActivityTracker.

Covers: category normalization, the 2-consecutive-frame debounce that guards
against single-frame screenshot noise, and get_info() before any input.
"""
from sense.activity_tracker import ActivityTracker


def test_first_screen_result_opens_a_segment():
    tracker = ActivityTracker()
    tracker.on_screen_result({"category": "code"})
    info = tracker.get_info()
    assert info["category"] == "coding"
    assert info["label"] == "写代码"


def test_get_info_before_any_result_is_unknown():
    tracker = ActivityTracker()
    info = tracker.get_info()
    assert info == {"category": "unknown", "duration_min": 0, "label": ""}


def test_repeated_same_category_keeps_segment_open():
    tracker = ActivityTracker()
    tracker.on_screen_result({"category": "browser"})
    first_segment = tracker._current
    tracker.on_screen_result({"category": "browsing"})  # maps to same normalized category
    assert tracker._current is first_segment
    assert tracker._current.sample_count == 2


def test_single_differing_frame_does_not_switch_category_debounce():
    tracker = ActivityTracker()
    tracker.on_screen_result({"category": "coding"})
    tracker.on_screen_result({"category": "gaming"})  # single noisy frame
    tracker.on_screen_result({"category": "coding"})  # back to original before confirmation
    assert tracker.get_info()["category"] == "coding"


def test_two_consecutive_frames_confirm_category_switch():
    tracker = ActivityTracker()
    tracker.on_screen_result({"category": "coding"})
    tracker.on_screen_result({"category": "gaming"})
    tracker.on_screen_result({"category": "gaming"})  # 2nd consecutive frame confirms
    assert tracker.get_info()["category"] == "gaming"


def test_unrecognized_category_normalizes_to_other():
    tracker = ActivityTracker()
    tracker.on_screen_result({"category": "some_unknown_label"})
    assert tracker.get_info()["category"] == "other"


def test_missing_category_key_defaults_to_other():
    tracker = ActivityTracker()
    tracker.on_screen_result({})
    assert tracker.get_info()["category"] == "other"


def test_category_normalization_is_case_and_whitespace_insensitive():
    tracker = ActivityTracker()
    tracker.on_screen_result({"category": "  Code  "})
    assert tracker.get_info()["category"] == "coding"
