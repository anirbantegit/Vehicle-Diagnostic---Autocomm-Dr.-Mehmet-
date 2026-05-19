import time

from app.automation.clicker import click_window_relative, find_text_controls_in_region, click_first_match
from app.automation.extractor import extract_visible_texts, screen_contains_any
from app.automation.window import connect_autocom_window, get_autocom_window_status
from app.autocom.rest_client import AutocomRestClient
from app.autocom.signalr_legacy import ClassicSignalRClient
from app.config import (
    DEFAULT_WAIT_AFTER_CLICK,
    GENERIC_OBD_CLICK_X,
    GENERIC_OBD_CLICK_Y,
    HARDWARE_SETUP_KEYWORDS,
    DIAGNOSTIC_READY_KEYWORDS,
)


class BridgeOrchestrator:
    def __init__(self, rest_client: AutocomRestClient, signalr_client: ClassicSignalRClient):
        self.rest_client = rest_client
        self.signalr_client = signalr_client

    def status(self):
        return {
            "window": get_autocom_window_status(),
            "autocom_api": self.rest_client.health(),
            "signalr": self.signalr_client.status(),
        }

    def extract_screen(self):
        win = connect_autocom_window()
        return extract_visible_texts(win)

    def click_text(self, target_text: str, region: dict, relative_to_window: bool = True):
        win = connect_autocom_window()
        matches = find_text_controls_in_region(
            win=win,
            target_text=target_text,
            region=region,
            relative_to_window=relative_to_window,
        )
        clicked = click_first_match(matches, target_text)
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)

        return {
            "clicked": True,
            "target": clicked.window_text(),
            "screen": extract_visible_texts(win),
        }

    def click_window_point(self, x: int, y: int):
        win = connect_autocom_window()
        clicked = click_window_relative(win, x, y)
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)

        return {
            "clicked": True,
            "point": clicked,
            "screen": extract_visible_texts(win),
        }

    def start_generic_obd(self):
        """
        Generic OBD icon is a desktop-shell action.
        After clicking it, the state can be:
          - NEED_VCI_SETUP: hardware setup popup appears
          - READY_FOR_DIAGNOSIS: Angular diagnostic function UI appears
          - UNKNOWN: bridge returns extracted screen for operator/dev inspection
        """
        win = connect_autocom_window()

        click_window_relative(win, GENERIC_OBD_CLICK_X, GENERIC_OBD_CLICK_Y)
        time.sleep(DEFAULT_WAIT_AFTER_CLICK)

        if screen_contains_any(win, HARDWARE_SETUP_KEYWORDS):
            return {
                "state": "NEED_VCI_SETUP",
                "message": "Generic OBD opened Hardware setup / VCI gate.",
                "available_actions": [
                    "hardware_search_vci",
                    "hardware_test_vci",
                    "screen_texts",
                ],
                "screen": extract_visible_texts(win),
            }

        if screen_contains_any(win, DIAGNOSTIC_READY_KEYWORDS):
            return {
                "state": "READY_FOR_DIAGNOSIS",
                "message": "Generic OBD appears to be on diagnostic/function screen.",
                "available_actions": [
                    "get_capabilities",
                    "get_obd_functions",
                    "get_rtd_functions",
                    "run_diagnosis",
                ],
                "screen": extract_visible_texts(win),
            }

        return {
            "state": "UNKNOWN",
            "message": "Generic OBD click completed, but bridge could not classify screen.",
            "screen": extract_visible_texts(win),
        }

    def hardware_search_vci(self):
        # Hardware setup popup currently has no confirmed REST endpoint.
        # Use UI automation by exact text inside full window.
        return self.click_text("Search", {
            "left_min": 0,
            "left_max": 2000,
            "top_min": 0,
            "top_max": 1200,
        })

    def hardware_test_vci(self):
        return self.click_text("Test", {
            "left_min": 0,
            "left_max": 2000,
            "top_min": 0,
            "top_max": 1200,
        })