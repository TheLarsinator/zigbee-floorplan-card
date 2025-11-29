# Zigbee Floorplan Card - Project Summary

## 📦 What's Included

This package contains everything you need to visualize your Zigbee network on a custom floorplan in Home Assistant.

### Core Files

1. **zigbee-floorplan-card.js** - The main custom card component
   - Custom element for Home Assistant Lovelace
   - Renders Zigbee network topology on floorplan images
   - Color-coded devices and link quality visualization
   - Interactive features: refresh button, LQI filter, path highlighting

### Documentation

2. **README.md** - Complete documentation
   - Installation instructions
   - Configuration guide
   - Troubleshooting tips
   - Advanced usage examples

3. **QUICKSTART.md** - Fast setup guide
   - Step-by-step setup process
   - Common issues and solutions
   - Minimal working example

4. **MQTT-SETUP.md** - MQTT sensor setup guide
   - Detailed MQTT configuration
   - Zigbee2MQTT integration
   - Automation examples

5. **PROJECT-INFO.md** - This file
   - Project overview
   - File descriptions
   - Quick reference

### Configuration Examples

6. **configuration-example.yaml** - Complete Home Assistant configuration
   - MQTT sensor setup
   - Automation configuration
   - Full card configuration with all options

7. **automation-example.yaml** - Automation examples
   - Network map request automation
   - Alternative scheduling options

8. **card-config-example.yaml** - Card configuration examples
   - Basic and advanced configurations
   - Multiple example scenarios

### Tools & Helpers

9. **coordinate-picker.html** - Interactive coordinate mapping tool
   - Visual coordinate picker
   - Upload your floorplan
   - Click to place devices
   - Auto-generates YAML configuration

### Integration Files

10. **hacs.json** - HACS integration configuration
    - For Home Assistant Community Store installation

---

## 🎯 Key Features

### Device Visualization
- **Red circles**: Coordinators (network center)
- **Blue circles**: Routers (extend network range)
- **Green circles**: End devices (sensors, switches, etc.)

### Link Quality Display
- Connection lines between devices
- Color-coded by LQI (Link Quality Indicator):
  - 🟢 Green (200-255): Excellent signal
  - 🟡 Yellow-green (150-199): Good signal
  - 🟠 Orange (100-149): Fair signal
  - 🔴 Red (0-99): Poor signal
- Optional LQI values displayed on connections

### Interactive Features
- 🔄 Manual refresh button to request network map
- 🕒 Last update timestamp display
- 🎚️ LQI filter slider to hide weak links
- 🖱️ Click devices to highlight path to coordinator
- 📍 Path-finding algorithm shows optimal routes

### Customization
- Custom floorplan images
- Configurable device coordinates
- **Auto-friendly names** - Automatically finds device names from Home Assistant
- Manual friendly name overrides
- Adjustable circle sizes
- Toggle labels and LQI display
- Custom card title

---

## 🚀 Quick Install

1. Copy `zigbee-floorplan-card.js` to `/config/www/`
2. Add resource in **Settings** → **Dashboards** → **Resources**
   - URL: `/local/zigbee-floorplan-card.js`
   - Type: JavaScript Module
3. Add your floorplan image to `/config/www/`
4. Use `coordinate-picker.html` to map device locations
5. Add the card to your dashboard with generated configuration

---

## 📋 Requirements

### Home Assistant Requirements
- Home Assistant 2023.1.0 or newer
- Lovelace dashboard (default or YAML mode)
- Zigbee integration with network map data

### Zigbee Integration Options
Works with either:
- **Zigbee2MQTT** (recommended)
  - Provides `sensor.<coordinator>_networkmap` entity
  - Contains full network topology in attributes
  
- **ZHA (Zigbee Home Automation)**
  - May need to enable network map sensor
  - Check entity attributes for `links` data
  - Not tested by author

### Data Format
The card expects an entity with a `links` attribute containing:
```yaml
links:
  - source:
      ieeeAddr: '0x...'
      networkAddress: 1234
    target:
      ieeeAddr: '0x...'
      networkAddress: 0
    lqi: 255
    linkquality: 255
    relationship: 2
    depth: 1
```

---

## 🛠️ Configuration Template

Minimal configuration:
```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zigbee2mqtt_networkmap
image: /local/floorplan.png
device_coordinates:
  '0xYOURDEVICEADDRESS':
    x: 500
    y: 400
# Note: Device names come automatically from Zigbee2MQTT!
```

Full configuration with all options:
```yaml
type: custom:zigbee-floorplan-card
entity: sensor.zigbee2mqtt_networkmap
image: /local/floorplan.png
image_width: 1000
image_height: 800
circle_radius: 10
show_labels: true
show_link_lqi: false  # Show LQI numbers on connections (default: false)
mqtt_base_topic: zigbee2mqtt
friendly_names:  # Optional overrides
  '0xbc026efffe29c7de': 'Main Coordinator'
device_coordinates:
  '0xbc026efffe29c7de':
    x: 500
    y: 400
  '0x001788010d5caf75':
    x: 200
    y: 200
```

---

## 📐 Setting Up Coordinates

### Method 1: Use the Coordinate Picker (Easiest)
1. Open `coordinate-picker.html` in a browser
2. Upload your floorplan image
3. Enter device IEEE address
4. Click on the device location
5. Copy generated YAML

### Method 2: Image Editor
1. Open floorplan in GIMP, Photoshop, or similar
2. Enable coordinate display
3. Click where devices are located
4. Note x,y pixel coordinates
5. Add to configuration

### Method 3: Trial and Error
1. Start with estimated coordinates
2. View card in Home Assistant
3. Adjust coordinates as needed
4. Refresh to see changes

---

## 🎨 Creating a Floorplan

### Option 1: Draw Your Own
- Use drawing software (Paint, PowerPoint, etc.)
- Draw room outlines
- Add labels for reference
- Save as PNG or JPG
- Recommended size: 800-1200px wide

### Option 2: Use Existing Plans
- Scan architectural drawings
- Trace over photos
- Use online floorplan tools
- Convert to image format

---

## 🔍 Troubleshooting

### Card Not Loading
- Clear browser cache (Ctrl+Shift+R)
- Check JavaScript console for errors (F12)
- Verify resource is added in Lovelace

### No Devices Showing
- Verify IEEE addresses match exactly
- Check entity has `links` attribute
- Ensure coordinates are within image bounds

### Poor Link Visibility
- Increase image size
- Adjust device spacing
- Use contrasting background colors

### Entity Not Found
- Check entity ID in Developer Tools → States
- Verify Zigbee integration is working
- Ensure network map is enabled

---

## 📊 Understanding Device Types

### Coordinator (Red)
- Network center
- Usually networkAddress = 0
- All devices connect through it
- Typically your Zigbee USB stick/gateway

### Router (Blue)
- Extends network range
- Can route messages between devices
- Always powered on
- Examples: Smart plugs, powered lights

### End Device (Green)
- Low-power devices
- Don't route messages
- Examples: Sensors, battery-powered devices
- Sleep to save battery

---

## 🌟 Best Practices

1. **Start Small**: Begin with coordinator + a few devices
2. **Test Connectivity**: Check LQI values to optimize device placement
3. **Router Placement**: Distribute routers evenly for good coverage
4. **Update Regularly**: Zigbee networks change as devices are added/moved
5. **Use Friendly Names**: Makes identification much easier
6. **Multiple Floors**: Create separate cards for each level
7. **Backup Configuration**: Save your device coordinates

---

## 🤝 Support & Community

### Getting Help
- Check the README.md troubleshooting section
- Review QUICKSTART.md for common issues
- Verify configuration against examples

### Contributing
- Report bugs and issues
- Suggest new features
- Share your configurations
- Improve documentation

---

## 📜 License

MIT License - Feel free to use, modify, and distribute

---

## 🙏 Credits

- Designed for the Home Assistant community
- Works with Zigbee2MQTT and ZHA
- Built using standard Web Components

---

## 📞 Quick Links

- **Full Docs**: README.md
- **Quick Setup**: QUICKSTART.md
- **Example Config**: card-config-example.yaml
- **Coordinate Tool**: coordinate-picker.html

---

**Happy Mapping! 🏠📡**
