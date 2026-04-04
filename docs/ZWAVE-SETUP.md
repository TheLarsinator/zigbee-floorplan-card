# Z-Wave (Z-Wave JS) Setup Guide

This guide explains how to use the Zigbee Floorplan Card with the **Z-Wave JS** integration to visualize your Z-Wave mesh network.

## Overview

The card works with Z-Wave JS by using:

1. A **pyscript** service that reads the Z-Wave JS controller data and fires an event containing nodes and routing topology
2. An **automation** that calls the pyscript on a schedule or when routes are rebuilt

## Prerequisites

- ✅ Home Assistant running with Z-Wave JS integration
- ✅ [pyscript](https://github.com/custom-components/pyscript) installed (available via HACS)
- ✅ A floorplan image ready

## Step 1: Install pyscript

1. Open HACS in Home Assistant
2. Search for **"Pyscript"** and install it
3. Restart Home Assistant
4. Create the pyscript directory if it does not exist: `/config/pyscript/`

## Step 2: Add the Pyscript Service

Create a new file `/config/pyscript/update_zwave_device_list.py` with the following content:

```python
"""Fetch Z-Wave device list with routing topology data."""

import datetime


@service
def update_zwave_device_list():
    """Collect Z-Wave device data including neighbor/routing information and fire event."""

    from homeassistant.helpers import device_registry as dr

    devices = []
    node_map = {}
    controller_id = None

    # Build node_id -> friendly_name map from device registry
    dev_reg = dr.async_get(hass)
    node_names = {}
    for device in dev_reg.devices.values():
        for identifier in device.identifiers:
            if identifier[0] == "zwave_js":
                id_str = str(identifier[1])
                parts = id_str.split("-")
                try:
                    nid = int(parts[-1])
                    node_names[nid] = device.name_by_user or device.name or f"Node {nid}"
                except (ValueError, IndexError):
                    pass

    # Find Z-Wave JS controller via config entries (HA 2024+ pattern)
    controller = None
    config_entries = hass.config_entries.async_entries("zwave_js")

    if not config_entries:
        log.error("No Z-Wave JS config entries found")
        return

    for entry in config_entries:
        try:
            runtime_data = getattr(entry, "runtime_data", None)
            if runtime_data is None:
                continue

            if hasattr(runtime_data, "client"):
                client = runtime_data.client
            elif isinstance(runtime_data, dict) and "client" in runtime_data:
                client = runtime_data["client"]
            else:
                continue

            if client and hasattr(client, "driver") and client.driver:
                controller = client.driver.controller
                if controller and hasattr(controller, "nodes"):
                    break
        except Exception as ex:
            log.warning(f"Could not read entry {entry.entry_id}: {ex}")

    if not controller:
        log.error("No Z-Wave JS controller found – check integration status")
        return

    # First pass: collect node data and find controller
    node_stats = {}  # Store stats for link building
    for node_id, node in controller.nodes.items():
        friendly_name = node_names.get(node_id, f"Node {node_id}")

        is_controller = getattr(node, "is_controller_node", False)
        if is_controller:
            controller_id = node_id

        # Device type
        if is_controller:
            device_type = "Coordinator"
        elif getattr(node, "is_listening", False) and getattr(node, "is_routing", False):
            device_type = "Router"
        else:
            device_type = "EndDevice"

        # Get statistics for RSSI and routing info
        stats = getattr(node, "statistics", None)
        rssi = None
        if stats:
            rssi = getattr(stats, "rssi", None)
            node_stats[node_id] = stats

        device_info = {
            "node_id": node_id,
            "friendly_name": friendly_name,
            "device_type": device_type,
            "is_listening": getattr(node, "is_listening", False),
            "is_routing": getattr(node, "is_routing", False),
            "is_controller": is_controller,
            "neighbors": [],  # Will be populated from LWR
            "rssi": rssi,
        }
        devices.append(device_info)
        node_map[node_id] = device_info

    devices.sort(key=lambda d: d["node_id"])

    if controller_id is None:
        controller_id = 1  # Z-Wave JS convention: the controller is always node 1

    # Build links from LWR (Last Working Route) data
    links = []
    seen_links = set()  # Avoid duplicate links

    for node_id, stats in node_stats.items():
        if node_id == controller_id:
            continue  # Controller doesn't have routes to itself

        lwr = getattr(stats, "lwr", None)
        if not lwr:
            continue

        # Get RSSI for link quality
        rssi = getattr(lwr, "rssi", None)
        if rssi is not None and isinstance(rssi, (int, float)):
            lqi = max(0, min(255, int((rssi + 100) * 3.64)))
        else:
            lqi = 128

        # Get repeaters in the route
        repeaters = getattr(lwr, "repeaters", []) or []
        repeater_ids = []
        for r in repeaters:
            if hasattr(r, "node_id"):
                repeater_ids.append(r.node_id)

        # Build the route chain: node -> repeaters -> controller
        if repeater_ids:
            route = [node_id] + repeater_ids + [controller_id]
        else:
            route = [node_id, controller_id]

        # Create links for each hop in the route
        for i in range(len(route) - 1):
            src = route[i]
            tgt = route[i + 1]

            # Create canonical link key to avoid duplicates
            link_key = (min(src, tgt), max(src, tgt))
            if link_key in seen_links:
                continue
            seen_links.add(link_key)

            # Determine relationship
            if tgt == controller_id:
                relationship = 3  # Parent (connecting to controller)
            elif src == controller_id:
                relationship = 1  # Child
            else:
                relationship = 2  # Sibling (repeater connection)

            links.append({
                "source": {"ieeeAddr": str(src)},
                "target": {"ieeeAddr": str(tgt)},
                "lqi": lqi,
                "relationship": relationship,
            })

            # Update neighbors list for the device
            if src in node_map and tgt not in node_map[src]["neighbors"]:
                node_map[src]["neighbors"].append(tgt)
            if tgt in node_map and src not in node_map[tgt]["neighbors"]:
                node_map[tgt]["neighbors"].append(src)

    # Fire event consumed by the template sensor
    event.fire(
        "zwave_device_list",
        devices=devices,
        links=links,
        timestamp=datetime.datetime.now().isoformat(),
    )

    log.info(f"Z-Wave device list updated: {len(devices)} devices, {len(links)} links")
```

## Step 3: Add the Template Sensor

Add this to your `configuration.yaml`. It listens for the `zwave_device_list` event and builds the attributes the card requires.

```yaml
template:
  - sensor:
      - name: "ZWave Devices List"
        state: "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}"
        attributes:
          nodes: "{{ trigger.event.data.devices }}"
          links: "{{ trigger.event.data.links }}"
        trigger:
          - trigger: event
            event_type: "zwave_device_list"
```

## Step 4: Add the Automation

This automation calls the pyscript service on startup, on a schedule, and whenever Z-Wave routes are rebuilt.

```yaml
- id: zwave_device_list_update
  alias: "Z-Wave Device List Update"
  description: "Collects Z-Wave device data and fires zwave_device_list event"
  trigger:
    - trigger: homeassistant
      event: start
      id: startup
    - trigger: time_pattern
      hours: "/6"
      id: scheduled
    - trigger: event
      event_type: zwave_js_rebuild_node_routes_done
      id: routes_updated
  action:
    - delay:
        seconds: "{{ 30 if trigger.id == 'startup' else 0 }}"
    - service: pyscript.update_zwave_device_list
  mode: single
```

> **Tip:** The automation runs every 6 hours and also fires when routes are rebuilt. You can adjust the `hours: "/6"` schedule as needed.

## Step 5: Restart Home Assistant

Restart Home Assistant to load the pyscript, sensor, and automation.

After restart, you can manually trigger the service:

- **Developer Tools → Services → `pyscript.update_zwave_device_list`**

## Step 6: Add the Card

For Z-Wave, device identifiers are **node IDs** (as strings, e.g., `"1"`, `"5"`, `"12"`), not IEEE addresses. Use the numeric node ID reported by Z-Wave JS.

```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zwave_devices_list
image: /local/floorplan.png
device_coordinates:
  "1": { x: 500, y: 400 }   # Controller (node 1)
  "5": { x: 200, y: 200 }   # Living Room Switch
  "12": { x: 700, y: 300 }  # Bedroom Sensor
  # Add more devices...
```

## Finding Node IDs for Z-Wave Devices

1. Go to **Settings → Devices & Services → Z-Wave JS**
2. Click on any device
3. The **Node ID** is shown in the device information panel

Alternatively, after the sensor is populated:

1. Go to **Developer Tools → States**
2. Find `sensor.zwave_devices_list`
3. Expand the `nodes` attribute — each node has a `node_id` field

## Troubleshooting

**Sensor state is unavailable or empty**
- Verify `pyscript` is installed and the script file is in `/config/pyscript/`
- Restart Home Assistant and manually call `pyscript.update_zwave_device_list`
- Check Home Assistant logs for pyscript errors

**"No Z-Wave JS controller found" in logs**
- Ensure the Z-Wave JS integration is running and connected to the Z-Wave stick
- Try restarting Home Assistant and re-running the service

**No links showing**
- Links are derived from the **Last Working Route (LWR)** data in Z-Wave JS
- After initial setup, rebuild routes in Z-Wave JS and re-run the service
- Not all nodes have LWR data until they have communicated with the controller

**Device names showing as "Node X"**
- Set friendly names for devices in Home Assistant:
  **Settings → Devices & Services → Z-Wave JS → device → rename**
- Re-run the `pyscript.update_zwave_device_list` service after renaming
