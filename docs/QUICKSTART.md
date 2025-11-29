# Quick Start Guide - Zigbee Floorplan Card

Get your Zigbee network visualization up and running in 5 steps!

## Prerequisites

- ✅ Home Assistant running
- ✅ Zigbee2MQTT installed and working
- ✅ MQTT integration configured in Home Assistant
- ✅ A floorplan image ready

## Step 1: Install the Card (2 minutes)

1. Download `zigbee-floorplan-card.js`
2. Copy it to `<config>/www/` folder
3. Add resource to Home Assistant:
   - Settings → Dashboards → Resources (three-dot menu top right)
   - Click "+ Add Resource"
   - URL: `/local/zigbee-floorplan-card.js`
   - Type: JavaScript Module

## Step 2: Add MQTT Sensor (3 minutes)

Edit your `configuration.yaml` and add:

```yaml
mqtt:
  sensor:
    - name: Zigbee2mqtt Networkmap
      state_topic: zigbee2mqtt/bridge/response/networkmap
      value_template: >-
        {{ now().strftime('%Y-%m-%d %H:%M:%S') }}
      json_attributes_topic: zigbee2mqtt/bridge/response/networkmap
      json_attributes_template: "{{ value_json.data.value | tojson }}"
```

**Important:** If you use a custom Zigbee2MQTT base topic (not `zigbee2mqtt`), replace `zigbee2mqtt` in both topic lines above.

## Step 3: Add Automation (2 minutes)

Add this to `configuration.yaml` or `automations.yaml`:

```yaml
automation:
  - alias: "Request Zigbee Network Map"
    trigger:
      - platform: time
        at: "00:00:00"  # Once per day at midnight
      - platform: homeassistant
        event: start
    action:
      - service: mqtt.publish
        data:
          topic: zigbee2mqtt/bridge/request/networkmap
          payload: '{"type": "raw", "routes": true}'
```

## Step 4: Restart and Verify (3 minutes)

1. Check Configuration:
   - Developer Tools → YAML → "Check Configuration"
   
2. Restart Home Assistant:
   - Developer Tools → YAML → "Restart"
   
3. Verify the sensor:
   - Developer Tools → States
   - Search for `sensor.zigbee2mqtt_networkmap`
   - Should have attributes with `nodes` and `links`

If the sensor is empty, manually request the network map:
- Developer Tools → Services
- Service: `mqtt.publish`
- Service Data:
  ```yaml
  topic: zigbee2mqtt/bridge/request/networkmap
  payload: '{"type": "raw", "routes": true}'
  ```

## Step 5: Map Device Coordinates (10-20 minutes)

You need to map where each device is on your floorplan.

### Option A: Use Coordinate Picker Tool (Recommended)

1. Copy your floorplan image to `<config>/www/floorplan.png`
2. Open `coordinate-picker.html` in a web browser
3. Load your floorplan image
4. Click on each device location
5. Note the coordinates and IEEE addresses

### Option B: Manual Estimation

1. Upload your floorplan: `<config>/www/floorplan.png`
2. Estimate coordinates based on image size:
   - Default: 1000px wide × 800px tall
   - Left edge: x=0, Right edge: x=1000
   - Top edge: y=0, Bottom edge: y=800

### Get IEEE Addresses

Find your device IEEE addresses in:
- **Zigbee2MQTT Web UI** → Device list
- **Home Assistant** → Developer Tools → States → Any Zigbee entity
- **Zigbee2MQTT logs**

Example: `0x00124b001234abcd`

## Step 6: Add the Card (5 minutes)

1. Edit your dashboard
2. Add a new card
3. Choose "Manual" card type
4. Paste this configuration (update with your devices):

```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zigbee2mqtt_networkmap
image: /local/floorplan.png
device_coordinates:
  "0x00124b001234abcd": { x: 500, y: 400 }  # Coordinator
  "0x00124b005678efgh": { x: 300, y: 200 }  # Living Room Light
  "0x00124b009abcdef0": { x: 700, y: 300 }  # Bedroom Sensor
  # Add more devices...
```

5. Click "Save"

## Done! 🎉

You should now see your Zigbee network visualized on your floorplan with:
- ⭕ Red circles: Coordinator
- ⭕ Blue circles: Router devices
- ⭕ Green circles: End devices
- 📏 Lines between devices showing connections (color-coded by quality)
- 📝 Device friendly names
- 🔄 Refresh button to request new network map
- 🎚️ LQI filter slider to hide weak links
- 🖱️ Click devices to highlight their path to coordinator

## Customize (Optional)

Add these options to your card configuration:

```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zigbee2mqtt_networkmap
image: /local/floorplan.png
device_coordinates:
  # ... your devices ...

# Optional customization
image_width: 1000           # Adjust to your image width
image_height: 800           # Adjust to your image height
circle_radius: 15           # Bigger device circles
show_labels: true           # Show device names
show_link_lqi: false        # Hide link quality numbers on connections (default: false)
```

## Tips

### Set Friendly Names in Zigbee2MQTT

Make your device names readable:

1. Open Zigbee2MQTT web interface
2. Click a device
3. Change "Friendly name" to something meaningful
4. Example: `0x00124b005678efgh` → `Living Room Light`

### Common Issues

**Card shows "Entity not found"**
- Wait a few minutes after restart
- Check that sensor name is `sensor.zigbee2mqtt_networkmap`

**No devices showing**
- Check `device_coordinates` has correct IEEE addresses
- Verify coordinates are within image bounds

**Device names show as codes**
- Set friendly names in Zigbee2MQTT
- Wait for next network map request (up to 5 minutes)
- Or manually request: See Step 4

**No links showing**
- Make sure automation is running
- Check payload includes `"routes": true`

### Getting Help

1. Check browser console (F12) for error messages
2. Look for `[Zigbee Floorplan]` debug messages
3. Verify sensor data in Developer Tools → States
4. Check Home Assistant logs for errors

## Next Steps

- Fine-tune device coordinates for perfect positioning
- Adjust colors and sizes to match your preference
- Add more devices as you expand your Zigbee network
- Share your floorplan with the Home Assistant community!

## Example Configuration Files

See included files:
- `configuration-example.yaml` - Complete configuration
- `MQTT-SETUP.md` - Detailed MQTT setup guide
- `MIGRATION-GUIDE.md` - Upgrading from older versions

Enjoy your Zigbee network visualization! 🎊
