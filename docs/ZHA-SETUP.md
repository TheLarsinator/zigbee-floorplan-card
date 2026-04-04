# ZHA (Zigbee Home Automation) Setup Guide

This guide explains how to use the Zigbee Floorplan Card with the **ZHA (Zigbee Home Automation)** integration instead of Zigbee2MQTT.

## Overview

The card works with ZHA by using:

1. A **template sensor** that builds the network map from ZHA device data
2. An **automation** that periodically fires a ZHA device list event using [zha_toolkit](https://github.com/mdeweerd/zha-toolkit)

## Prerequisites

- ✅ Home Assistant running with ZHA integration
- ✅ [zha_toolkit](https://github.com/mdeweerd/zha-toolkit) installed (available via HACS)
- ✅ A floorplan image ready

## Step 1: Install zha_toolkit

The automation relies on `zha_toolkit` to retrieve the ZHA device list and fire the event that the template sensor listens for.

1. Open HACS in Home Assistant
2. Search for **"ZHA Toolkit"** and install it
3. Restart Home Assistant

## Step 2: Add the Template Sensor

Add this sensor to your `configuration.yaml`. It listens for a `zha_device_list` event fired by the automation and builds the `nodes` and `links` attributes that the card requires.

```yaml
template:
  - sensor:
      - name: "ZHA Devices List"
        state: "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}"
        attributes:
          nodes: >
            {% set ns = namespace(output=[], ieee_names={}) %}
            {% for entity_id in integration_entities('zha') %}
              {% set did = device_id(entity_id) %}
              {% if did %}
                {% for id_pair in device_attr(did, 'identifiers') | default([], true) %}
                  {% if id_pair[0] == 'zha' and id_pair[1] not in ns.ieee_names %}
                    {% set ns.ieee_names = dict(ns.ieee_names, **{id_pair[1]: device_attr(did, 'name_by_user') or device_attr(did, 'name')}) %}
                  {% endif %}
                {% endfor %}
              {% endif %}
            {% endfor %}
            {% for device in trigger.event.data.devices %}
              {% set current = {
                'ieeeAddr': device.ieee,
                'friendly_name': ns.ieee_names.get(device.ieee, device.friendly_name),
                'type': device.device_type,
                'networkAddress': device.nwk
              } %}
              {% set ns.output = ns.output + [current] %}
            {% endfor %}
            {{ ns.output }}
          links: >
            {% set ns = namespace(output=[]) %}
            {% set relationships = {
              'None': 0,
              'Child': 1,
              'Sibling': 2,
              'Parent': 3,
              'Neighbor': 4
            } %}
            {% for device in trigger.event.data.devices %}
              {% for neighbor in device.neighbors %}
                {% set current = {
                  'source': {'ieeeAddr': device.ieee },
                  'target': {'ieeeAddr': neighbor.ieee},
                  'lqi': int(neighbor.lqi),
                  'relationship': relationships.get(neighbor.relationship)
                } %}
                {% set ns.output = ns.output + [current] %}
              {% endfor %}
            {% endfor %}
            {{ ns.output }}
        trigger:
          - trigger: event
            event_type: "zha_device_list"
```

## Step 3: Add the Automation

This automation calls `zha_toolkit.zha_devices` on a schedule to fire the `zha_device_list` event that the sensor listens for.

```yaml
alias: ZHA Device List Refresh
description: ""
triggers:
  - trigger: time_pattern
    hours: "*"
    minutes: "10"
    seconds: "0"
conditions: []
actions:
  - action: zha_toolkit.zha_devices
    data:
      event_success: zha_device_list
mode: single
```

> **Tip:** The automation runs every hour at the 10-minute mark. You can adjust the schedule as needed.

## Step 4: Restart Home Assistant

Restart Home Assistant to load the new sensor and automation.

After restart, you can manually trigger the automation to populate the sensor immediately:

- **Developer Tools → Services → `zha_toolkit.zha_devices`**
  - Data: `event_success: zha_device_list`

## Step 5: Add the Card

The card configuration for ZHA is the same as for Zigbee2MQTT, except you reference the new sensor entity. Device identifiers use **IEEE addresses** (e.g., `0x00158d0001a2b3c4`).

```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zha_devices_list
image: /local/floorplan.png
device_coordinates:
  "0xbc026efffe29c7de": { x: 500, y: 400 }  # Coordinator
  "0x00158d0001a2b3c4": { x: 200, y: 200 }  # Living Room Light
  # Add more devices...
```

## Finding IEEE Addresses for ZHA Devices

1. Go to **Settings → Devices & Services → Zigbee Home Automation**
2. Click on any device
3. The IEEE address is shown in the device information panel (format: `0x...`)

Alternatively, after the sensor is populated:

1. Go to **Developer Tools → States**
2. Find `sensor.zha_devices_list`
3. Expand the `nodes` attribute to see all IEEE addresses

## Troubleshooting

**Sensor state is unavailable or empty**
- Verify `zha_toolkit` is installed and restart Home Assistant
- Manually trigger the `zha_toolkit.zha_devices` service call
- Check Developer Tools → States for `sensor.zha_devices_list`

**No links showing**
- ZHA must have scanned neighbors for your devices — this data is collected during normal operation
- Run a **scan** from the ZHA interface to refresh neighbor tables

**Device names showing as codes**
- Ensure devices have friendly names set in the ZHA interface (**Settings → Devices & Services → Zigbee Home Automation → device → rename**)
- The template sensor resolves names from `name_by_user` first, then falls back to `name`
