# Zigbee Floorplan Card - MQTT Setup Guide

This guide explains how to set up the MQTT sensor to get the Zigbee network map with device friendly names.

## Overview

The card now reads the network map data directly from Zigbee2MQTT via MQTT. This provides:
- **Automatic friendly names** from your Zigbee2MQTT configuration
- **Device types** (Coordinator, Router, EndDevice)
- **Complete network topology** with link quality

## Step 1: Create the MQTT Sensor

Add this configuration to your Home Assistant `configuration.yaml`:

```yaml
mqtt:
  sensor:
    - name: Zigbee2mqtt Networkmap
      # If you changed base_topic of Zigbee2mqtt, change state_topic accordingly
      state_topic: zigbee2mqtt/bridge/response/networkmap
      value_template: >-
        {{ now().strftime('%Y-%m-%d %H:%M:%S') }}
      # Again, if you changed base_topic of Zigbee2mqtt, change json_attributes_topic accordingly
      json_attributes_topic: zigbee2mqtt/bridge/response/networkmap
      json_attributes_template: "{{ value_json.data.value | tojson }}"
```

### Custom Base Topic

If you changed the `base_topic` in your Zigbee2MQTT configuration (default is `zigbee2mqtt`), update both topics:

```yaml
mqtt:
  sensor:
    - name: Zigbee2mqtt Networkmap
      state_topic: YOUR_BASE_TOPIC/bridge/response/networkmap
      value_template: >-
        {{ now().strftime('%Y-%m-%d %H:%M:%S') }}
      json_attributes_topic: YOUR_BASE_TOPIC/bridge/response/networkmap
      json_attributes_template: "{{ value_json.data.value | tojson }}"
```

## Step 2: Restart Home Assistant

After adding the sensor configuration:

1. Go to **Developer Tools** → **YAML** → **Check Configuration**
2. If no errors, click **Restart**
3. Wait for Home Assistant to restart

## Step 3: Request Network Map

The sensor needs to be populated with data. Zigbee2MQTT will send the network map when requested.

### Option A: Automatic Request (Optional)

Create an automation to request the network map periodically:

```yaml
automation:
  - alias: "Request Zigbee Network Map"
    trigger:
      - platform: time
        at: "00:00:00"  # Once per day at midnight
      - platform: homeassistant
        event: start  # On Home Assistant start
    action:
      - service: mqtt.publish
        data:
          topic: zigbee2mqtt/bridge/request/networkmap
          payload: '{"type": "raw", "routes": true}'
```

### Option B: Manual Request

Use **Developer Tools** → **Services**:

**Service:** `mqtt.publish`

**Service Data:**
```yaml
topic: zigbee2mqtt/bridge/request/networkmap
payload: '{"type": "raw", "routes": true}'
```

## Step 4: Verify the Sensor

1. Go to **Developer Tools** → **States**
2. Search for `sensor.zigbee2mqtt_networkmap`
3. Check that it has attributes with `nodes` and `links` data

Example attributes structure:
```json
{
  "nodes": [
    {
      "ieeeAddr": "0x00124b001234abcd",
      "friendly_name": "Coordinator",
      "type": "Coordinator",
      "networkAddress": 0
    },
    {
      "ieeeAddr": "0x00124b005678efgh",
      "friendly_name": "Living Room Light",
      "type": "Router",
      "networkAddress": 12345
    }
  ],
  "links": [
    {
      "source": {"ieeeAddr": "0x00124b001234abcd"},
      "target": {"ieeeAddr": "0x00124b005678efgh"},
      "lqi": 255,
      "relationship": 2
    }
  ]
}
```

## Step 5: Update Card Configuration

Update your card configuration to use the new sensor:

```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zigbee2mqtt_networkmap  # The MQTT sensor
image: /local/floorplan.png
device_coordinates:
  "0x00124b001234abcd": { x: 500, y: 400 }  # Coordinator
  "0x00124b005678efgh": { x: 300, y: 200 }  # Living Room Light
  # Add more devices...
```

## Optional Configuration

### Custom MQTT Base Topic

If you're using a custom Zigbee2MQTT base topic:

```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zigbee2mqtt_networkmap
image: /local/floorplan.png
mqtt_base_topic: my_custom_topic  # Default is 'zigbee2mqtt'
device_coordinates:
  # ...
```

### Manual Friendly Name Override

You can still override individual device names:

```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zigbee2mqtt_networkmap
image: /local/floorplan.png
device_coordinates:
  # ...
friendly_names:
  "0x00124b005678efgh": "My Custom Name"  # Override the Z2M name
```

## Setting Friendly Names in Zigbee2MQTT

To set or change device friendly names in Zigbee2MQTT:

### Method 1: Zigbee2MQTT Web UI
1. Open Zigbee2MQTT web interface
2. Click on a device
3. Edit the "Friendly name" field
4. Click "Save"

### Method 2: Configuration File
Edit `configuration.yaml` in your Zigbee2MQTT config directory:

```yaml
devices:
  '0x00124b005678efgh':
    friendly_name: 'Living Room Light'
  '0x00124b009abcdef0':
    friendly_name: 'Bedroom Sensor'
```

After making changes, restart Zigbee2MQTT.

## Troubleshooting

### Sensor has no data
- Make sure Zigbee2MQTT is running
- Request the network map manually (see Step 3, Option B)
- Check MQTT Explorer to see if messages are being published

### Sensor shows "unknown" or "unavailable"
- Check that the MQTT integration is working
- Verify the topics match your Zigbee2MQTT base topic
- Check Home Assistant logs for errors

### Device names still show codes
- Check that the sensor has `nodes` array in attributes
- Verify nodes have `friendly_name` property
- Check browser console for debug messages: `[Zigbee Floorplan] Loaded device names`

### Links not showing
- Make sure to request network map with routes: `{"type": "raw", "routes": true}`
- Verify the sensor has `links` array in attributes

## Version Requirements

- **Home Assistant:** 0.107 or later
- **Zigbee2MQTT:** 1.17.0 or later
- **MQTT Integration:** Must be configured in Home Assistant

## References

- [Zigbee2MQTT MQTT Topics](https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html)
- [Zigbee2MQTT Device Configuration](https://www.zigbee2mqtt.io/guide/configuration/devices-groups.html#common-device-options)
- [Home Assistant MQTT Integration](https://www.home-assistant.io/integrations/mqtt/)
