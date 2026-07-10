"""
Tests for sense.screen.is_sensitive_window — the privacy red line that gates
screenshot capture and upload (see module docstring: "隐私红线（必须保留）").
"""
from sense.screen import is_sensitive_window


def test_chinese_keyword_marks_window_sensitive():
    assert is_sensitive_window("支付宝 - 扫码支付") is True


def test_english_keyword_marks_window_sensitive():
    assert is_sensitive_window("Bank of America - Sign In") is True


def test_ordinary_window_title_is_not_sensitive():
    assert is_sensitive_window("main.rs - Visual Studio Code") is False


def test_matching_is_case_insensitive():
    assert is_sensitive_window("MY BANK ACCOUNT") is True


def test_empty_title_is_not_sensitive():
    assert is_sensitive_window("") is False


def test_none_title_is_not_sensitive():
    assert is_sensitive_window(None) is False
