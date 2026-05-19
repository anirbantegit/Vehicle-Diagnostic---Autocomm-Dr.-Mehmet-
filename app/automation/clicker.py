from pywinauto import mouse


def resolve_region(win, region, relative_to_window=True):
    if not relative_to_window:
        return region

    win_rect = win.rectangle()

    return {
        "left_min": win_rect.left + region["left_min"],
        "left_max": win_rect.left + region["left_max"],
        "top_min": win_rect.top + region["top_min"],
        "top_max": win_rect.top + region["top_max"],
    }


def find_text_controls_in_region(win, target_text, region, relative_to_window=True):
    absolute_region = resolve_region(
        win=win,
        region=region,
        relative_to_window=relative_to_window
    )

    matches = []

    for ctrl in win.descendants():
        try:
            text = ctrl.window_text()

            if not text:
                continue

            clean_text = text.strip()

            if clean_text.lower() != target_text.lower():
                continue

            control_type = ctrl.element_info.control_type
            rect = ctrl.rectangle()

            if rect.left == 0 and rect.top == 0 and rect.right == 0 and rect.bottom == 0:
                continue

            center_x = int((rect.left + rect.right) / 2)
            center_y = int((rect.top + rect.bottom) / 2)

            if not (
                    absolute_region["left_min"] <= center_x <= absolute_region["left_max"]
                    and absolute_region["top_min"] <= center_y <= absolute_region["top_max"]
            ):
                continue

            if control_type in ["Text", "Button", "Custom"]:
                matches.append(ctrl)

        except Exception:
            pass

    matches.sort(key=lambda c: (
            (c.rectangle().right - c.rectangle().left)
            * (c.rectangle().bottom - c.rectangle().top)
    ))

    return matches


def click_first_match(matches, label):
    if not matches:
        raise RuntimeError(f"No matching control found for: {label}")

    target = matches[0]
    target.click_input()

    return target



def click_window_relative(win, x, y):
    """
    Click a point relative to the Autocom window.
    Use only for icon/sidebar/native-shell areas where UIA text controls are not exposed.
    """
    win_rect = win.rectangle()
    absolute_x = win_rect.left + x
    absolute_y = win_rect.top + y

    mouse.click(button="left", coords=(absolute_x, absolute_y))

    return {
        "x": absolute_x,
        "y": absolute_y,
        "relative_x": x,
        "relative_y": y,
    }


def click_region_center(win, region, relative_to_window=True):
    absolute_region = resolve_region(win, region, relative_to_window)
    x = int((absolute_region["left_min"] + absolute_region["left_max"]) / 2)
    y = int((absolute_region["top_min"] + absolute_region["top_max"]) / 2)
    mouse.click(button="left", coords=(x, y))
    return {"x": x, "y": y}