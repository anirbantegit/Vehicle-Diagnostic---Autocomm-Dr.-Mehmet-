from __future__ import annotations

from typing import Any


RTD_POPUP_TEMPLATE = "rtd_obd_function_popup"
RTD_POPUP_TEMPLATE_VERSION = 2
RTD_POPUP_ROOT_ID = "FormOBDFunction"
RTD_LOCATION_LIST_ID = "listBoxLocations"
RTD_FUNCTION_LABEL_ID = "labelHeader"
RTD_VEHICLE_LABEL_ID = "labelHeaderVehicle"
RTD_POPUP_ACTION_IDS = {
    "run": "autocomButtonPlay",
    "select_vehicle": "autocomButtonNavigate",
    "help": "autocomButtonHelp",
    "cancel": "buttonClose",
}
RTD_REQUIRED_SIGNATURE_IDS = [
    RTD_POPUP_ROOT_ID,
    RTD_FUNCTION_LABEL_ID,
    RTD_VEHICLE_LABEL_ID,
    RTD_LOCATION_LIST_ID,
    *RTD_POPUP_ACTION_IDS.values(),
]


def _rect_contains(container: dict[str, Any] | None, child: dict[str, Any] | None) -> bool:
    if not container or not child:
        return False
    return (
        int(child.get("left", -1)) >= int(container.get("left", 0))
        and int(child.get("top", -1)) >= int(container.get("top", 0))
        and int(child.get("right", 0)) <= int(container.get("right", -1))
        and int(child.get("bottom", 0)) <= int(container.get("bottom", -1))
    )


def _first_control(controls: list[dict[str, Any]], automation_id: str) -> dict[str, Any] | None:
    return next((control for control in controls if control.get("automation_id") == automation_id), None)


def _non_empty_text(control: dict[str, Any] | None) -> str:
    return str((control or {}).get("text") or "").strip()


def _rect_of(control: dict[str, Any] | None) -> dict[str, Any] | None:
    if not control:
        return None
    rect = control.get("rect_info") or control.get("rect")
    return rect if isinstance(rect, dict) else None


def _click_point(rect: dict[str, Any] | None) -> dict[str, int] | None:
    if not rect:
        return None
    if "center_x" in rect and "center_y" in rect:
        return {"x": int(rect["center_x"]), "y": int(rect["center_y"])}
    return {
        "x": int((int(rect["left"]) + int(rect["right"])) / 2),
        "y": int((int(rect["top"]) + int(rect["bottom"])) / 2),
    }


def _control_target(control: dict[str, Any]) -> dict[str, Any]:
    rect = _rect_of(control)
    return {
        "text": _non_empty_text(control),
        "automation_id": str(control.get("automation_id") or ""),
        "control_type": str(control.get("control_type") or ""),
        "class_name": str(control.get("class_name") or ""),
        "rect": rect,
        "click_point": _click_point(rect),
    }


def popup_identity_from_controls(
    controls: list[dict[str, Any]],
    selected_location_texts: set[str] | None = None,
    selection_source: str | None = None,
) -> dict[str, Any]:
    """Match and extract the native Real Time Data modal contract.

    Location rows are accepted only inside the native ``listBoxLocations``
    listbox. Selected row state comes from UIA/WinForms selection patterns when
    available; visual blue highlighting is intentionally not the primary
    detector because theme/display changes would make pixel decisions unsafe.
    """
    root = _first_control(controls, RTD_POPUP_ROOT_ID)
    location_list = _first_control(controls, RTD_LOCATION_LIST_ID)
    function_header = _first_control(controls, RTD_FUNCTION_LABEL_ID)
    vehicle_header = _first_control(controls, RTD_VEHICLE_LABEL_ID)

    actions = {
        action: _control_target(control)
        for action, automation_id in RTD_POPUP_ACTION_IDS.items()
        if (control := _first_control(controls, automation_id)) is not None
    }

    location_rect = _rect_of(location_list)
    normalised_selected = {
        text.strip().casefold() for text in (selected_location_texts or set()) if text.strip()
    }
    seen: set[str] = set()
    locations: list[dict[str, Any]] = []
    for control in controls:
        if str(control.get("control_type", "")).casefold() != "listitem":
            continue
        text = _non_empty_text(control)
        normalised_text = text.casefold()
        if not text or normalised_text in seen:
            continue
        item_rect = _rect_of(control)
        if not _rect_contains(location_rect, item_rect):
            continue
        seen.add(normalised_text)
        locations.append({
            "index": len(locations),
            "text": text,
            "title": text,
            "automation_id": str(control.get("automation_id") or ""),
            "control_type": "ListItem",
            "rect": item_rect,
            "click_point": _click_point(item_rect),
            "selected": None if selected_location_texts is None else normalised_text in normalised_selected,
            "selection_source": selection_source,
        })

    observed_signature_ids = [
        automation_id
        for automation_id in RTD_REQUIRED_SIGNATURE_IDS
        if _first_control(controls, automation_id) is not None
    ]
    confirmed = all(automation_id in observed_signature_ids for automation_id in RTD_REQUIRED_SIGNATURE_IDS)

    return {
        "kind": RTD_POPUP_TEMPLATE,
        "template_version": RTD_POPUP_TEMPLATE_VERSION,
        "blocking": True,
        "automation_id": RTD_POPUP_ROOT_ID,
        "function_title": _non_empty_text(function_header),
        "vehicle_title": _non_empty_text(vehicle_header),
        "location_list_automation_id": RTD_LOCATION_LIST_ID if location_list else None,
        "locations": locations,
        "options": locations,
        "selected_location_texts": sorted(selected_location_texts) if selected_location_texts is not None else None,
        "selection_source": selection_source,
        "action_controls": actions,
        "available_actions": list(actions.keys()),
        "observed_signature_ids": observed_signature_ids,
        "required_signature_ids": RTD_REQUIRED_SIGNATURE_IDS,
        "signature_confirmed": confirmed,
        "signature": ":".join(observed_signature_ids),
        "root_control": root,
    }
