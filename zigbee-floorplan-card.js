class ZigbeeFloorplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._refreshing = false;
    this._lqiFilter = 0;
    this._lastUpdate = null;
    this._selectedDevice = null;
    this._pathLinks = new Set();
    this._nodes = [];
    this._links = [];
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    if (!config.image) {
      throw new Error('You need to define an image');
    }
    if (!config.device_coordinates) {
      throw new Error('You need to define device_coordinates');
    }
    
    // Validate and sanitize config values
    const imageWidth = Math.max(1, Math.min(10000, parseInt(config.image_width) || 1000));
    const imageHeight = Math.max(1, Math.min(10000, parseInt(config.image_height) || 800));
    const circleRadius = Math.max(1, Math.min(100, parseInt(config.circle_radius) || 10));
    
    this._config = {
      entity: this._sanitizeString(config.entity),
      image: this._sanitizeUrl(config.image),
      device_coordinates: config.device_coordinates,
      image_width: imageWidth,
      image_height: imageHeight,
      circle_radius: circleRadius,
      show_labels: config.show_labels !== false,
      show_link_lqi: config.show_link_lqi === true,
      friendly_names: config.friendly_names || {},
      mqtt_base_topic: this._sanitizeString(config.mqtt_base_topic || 'zigbee2mqtt')
    };
  }

  _sanitizeString(str) {
    if (typeof str !== 'string') return '';
    // Remove potential script tags and other dangerous content
    return str.replace(/[<>"']/g, (char) => {
      const entities = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[char];
    });
  }

  _sanitizeUrl(url) {
    if (typeof url !== 'string') return '';
    // Only allow safe URL schemes
    const allowedSchemes = /^(https?:\/\/|\/)/i;
    if (!allowedSchemes.test(url)) {
      console.warn('[Zigbee Floorplan] Invalid image URL scheme, using empty string');
      return '';
    }
    return url;
  }

  _escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    
    // Only update if our entity changed, not on every hass update
    if (!oldHass || !this._config.entity) {
      this.updateCard();
      return;
    }
    
    const oldEntity = oldHass.states[this._config.entity];
    const newEntity = hass.states[this._config.entity];
    
    // Check if the entity state or attributes changed
    if (!oldEntity || !newEntity || 
        oldEntity.state !== newEntity.state ||
        oldEntity.last_updated !== newEntity.last_updated) {
      this.updateCard();
    }
  }

  getCardSize() {
    return 3;
  }

  updateCard() {
    if (!this._hass || !this._config.entity) {
      return;
    }

    const entity = this._hass.states[this._config.entity];
    if (!entity) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div class="card-content">Entity ${this._escapeHtml(this._config.entity)} not found</div>
        </ha-card>
      `;
      return;
    }

    // Get network map data from the entity attributes
    // This should be the response from zigbee2mqtt/bridge/response/networkmap
    const networkMapData = entity.attributes.value || entity.attributes;
    
    // Extract nodes (devices) and links from the network map
    this._nodes = networkMapData.nodes || [];
    this._links = networkMapData.links || [];
    
    // Build a map of IEEE addresses to friendly names
    this._deviceNames = new Map();
    this._nodes.forEach(node => {
      if (node.ieeeAddr && (node.friendlyName || node.friendly_name)) {
        const friendlyName = node.friendlyName || node.friendly_name;
        this._deviceNames.set(node.ieeeAddr.toLowerCase(), friendlyName);
      }
    });
    
    // Get last update timestamp from entity state
    this._lastUpdate = entity.state;
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          padding: 0;
        }
        .card-content {
          padding: 0;
        }
        .floorplan-container {
          position: relative;
          width: 100%;
          max-width: ${parseInt(this._config.image_width)}px;
          margin: 0 auto;
        }
        .floorplan-image {
          width: 100%;
          height: auto;
          display: block;
        }
        svg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
        .device-label {
          font-size: 12px;
          fill: #333;
          font-weight: 500;
          pointer-events: none;
          text-shadow: 1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white;
        }
        .lqi-label {
          font-size: 10px;
          fill: #666;
          pointer-events: none;
          text-shadow: 1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white;
        }
        .coordinator {
          fill: #ff0000;
          stroke: #990000;
          stroke-width: 2;
        }
        .router {
          fill: #0066ff;
          stroke: #003399;
          stroke-width: 2;
        }
        .end-device {
          fill: #00cc00;
          stroke: #006600;
          stroke-width: 2;
        }
        .device-circle {
          cursor: pointer;
          transition: stroke-width 0.2s;
        }
        .device-circle:hover {
          stroke-width: 3;
        }
        .device-circle.selected {
          stroke-width: 4;
          filter: drop-shadow(0 0 4px currentColor);
        }
        .link {
          stroke-width: 2;
          opacity: 0.6;
        }
        .link.dimmed {
          opacity: 0.1;
        }
        .link.path {
          stroke-width: 4;
          opacity: 1;
        }
        .command-bar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 16px;
          background: var(--card-background-color, #fff);
          border-top: 1px solid var(--divider-color, #e0e0e0);
          flex-wrap: wrap;
        }
        .refresh-button {
          padding: 8px 16px;
          background: var(--primary-color, #03a9f4);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.3s;
          white-space: nowrap;
        }
        .refresh-button:hover {
          background: var(--primary-color-dark, #0288d1);
        }
        .refresh-button:active {
          background: var(--primary-color-darker, #01579b);
        }
        .refresh-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .last-update {
          font-size: 12px;
          color: var(--secondary-text-color, #666);
          white-space: nowrap;
        }
        .lqi-filter {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 200px;
        }
        .lqi-filter label {
          font-size: 12px;
          color: var(--primary-text-color, #333);
          white-space: nowrap;
        }
        .lqi-filter input[type="range"] {
          flex: 1;
          min-width: 100px;
          accent-color: var(--primary-color, #03a9f4);
        }
        .lqi-filter .lqi-value {
          font-size: 12px;
          font-weight: 500;
          color: var(--primary-text-color, #333);
          min-width: 30px;
          text-align: right;
        }
      </style>
      <ha-card>
        <div class="card-content">
          <div class="floorplan-container">
            <img src="${this._escapeHtml(this._config.image)}" class="floorplan-image" alt="Floorplan" />
            <svg viewBox="0 0 ${parseInt(this._config.image_width)} ${parseInt(this._config.image_height)}" preserveAspectRatio="xMidYMid meet" id="network-svg">
              ${this.renderLinks(this._links)}
              ${this.renderDevices(this._nodes)}
            </svg>
          </div>
          <div class="command-bar">
            <button class="refresh-button" id="refresh-btn" ${this._refreshing ? 'disabled' : ''}>
              ${this._refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <div class="last-update">
              ${this._lastUpdate ? `Updated: ${this._escapeHtml(String(this._lastUpdate))}` : 'No data'}
            </div>
            <div class="lqi-filter">
              <label for="lqi-slider">Min LQI:</label>
              <input type="range" id="lqi-slider" min="0" max="255" value="${parseInt(this._lqiFilter) || 0}" />
              <span class="lqi-value">${parseInt(this._lqiFilter) || 0}</span>
            </div>
          </div>
        </div>
      </ha-card>
    `;
    
    // Add event listeners
    const refreshBtn = this.shadowRoot.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshNetworkMap());
    }
    
    const lqiSlider = this.shadowRoot.getElementById('lqi-slider');
    if (lqiSlider) {
      lqiSlider.addEventListener('input', (e) => {
        this._lqiFilter = parseInt(e.target.value);
        this.updateSVG();
      });
    }
    
    // Add click handlers to device circles
    const deviceCircles = this.shadowRoot.querySelectorAll('.device-circle');
    deviceCircles.forEach(circle => {
      circle.addEventListener('click', (e) => {
        const ieeeAddr = e.target.getAttribute('data-ieee');
        this.selectDevice(ieeeAddr, this._nodes, this._links);
      });
    });
  }

  updateSVG() {
    // Only update the SVG content, not the entire card
    const svg = this.shadowRoot.getElementById('network-svg');
    if (svg && this._nodes && this._links) {
      svg.innerHTML = `
        ${this.renderLinks(this._links)}
        ${this.renderDevices(this._nodes)}
      `;
      
      // Re-attach click handlers to device circles
      const deviceCircles = svg.querySelectorAll('.device-circle');
      deviceCircles.forEach(circle => {
        circle.addEventListener('click', (e) => {
          const ieeeAddr = e.target.getAttribute('data-ieee');
          this.selectDevice(ieeeAddr, this._nodes, this._links);
        });
      });
      
      // Update the LQI value display
      const lqiValue = this.shadowRoot.querySelector('.lqi-value');
      if (lqiValue) {
        lqiValue.textContent = this._lqiFilter;
      }
    }
  }

  refreshNetworkMap() {
    if (!this._hass || this._refreshing) {
      return;
    }
    
    this._refreshing = true;
    this.updateCard(); // Update UI to show "Refreshing..."
    
    // Call MQTT publish service to request network map
    this._hass.callService('mqtt', 'publish', {
      topic: `${this._config.mqtt_base_topic}/bridge/request/networkmap`,
      payload: JSON.stringify({ type: 'raw', routes: true })
    }).then(() => {
      // Reset refreshing state after a delay
      setTimeout(() => {
        this._refreshing = false;
        this.updateCard();
      }, 2000);
    }).catch((error) => {
      console.error('[Zigbee Floorplan] Failed to refresh network map:', error);
      this._refreshing = false;
      this.updateCard();
    });
  }

  formatTimestamp(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds ago
    
    if (diff < 60) {
      return 'Just now';
    } else if (diff < 3600) {
      const minutes = Math.floor(diff / 60);
      return `${minutes}m ago`;
    } else if (diff < 86400) {
      const hours = Math.floor(diff / 3600);
      return `${hours}h ago`;
    } else {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  selectDevice(ieeeAddr, nodes, links) {
    // Toggle selection - if same device clicked, deselect
    if (this._selectedDevice === ieeeAddr) {
      this._selectedDevice = null;
      this._pathLinks.clear();
    } else {
      this._selectedDevice = ieeeAddr;
      
      // Find coordinator
      const coordinator = nodes.find(n => n.type === 'Coordinator');
      
      if (!coordinator) {
        console.warn('[Zigbee Floorplan] No coordinator found');
        this._pathLinks.clear();
      } else if (ieeeAddr === coordinator.ieeeAddr) {
        // If coordinator selected, show all links
        this._pathLinks.clear();
        this._selectedDevice = null;
      } else {
        // Calculate path to coordinator
        const path = this.findPathToCoordinator(ieeeAddr, coordinator.ieeeAddr, links);
        this._pathLinks = new Set(path);
      }
    }
    
    this.updateSVG();
  }

  findPathToCoordinator(startAddr, coordinatorAddr, links) {
    // Build adjacency graph with LQI weights
    const graph = new Map();
    const linkMap = new Map(); // Store link keys for result
    
    links.forEach(link => {
      const sourceAddr = link.sourceIeeeAddr || (link.source && link.source.ieeeAddr);
      const targetAddr = link.targetIeeeAddr || (link.target && link.target.ieeeAddr);
      const lqi = link.lqi || link.linkquality || 0;
      
      if (!sourceAddr || !targetAddr) return;
      
      // Normalize addresses to lowercase for consistent comparison
      const normalizedSource = sourceAddr.toLowerCase();
      const normalizedTarget = targetAddr.toLowerCase();
      
      // Create a consistent link key (always sort addresses)
      const linkKey = [normalizedSource, normalizedTarget].sort().join('-');
      
      // Cost: lower LQI = higher cost
      const cost = 255 - lqi + 10; // Add hop penalty
      
      if (!graph.has(normalizedSource)) graph.set(normalizedSource, []);
      if (!graph.has(normalizedTarget)) graph.set(normalizedTarget, []);
      
      graph.get(normalizedSource).push({ node: normalizedTarget, cost, linkKey });
      graph.get(normalizedTarget).push({ node: normalizedSource, cost, linkKey });
    });
    

    
    // Dijkstra's algorithm
    const distances = new Map();
    const previous = new Map();
    const previousLink = new Map();
    const unvisited = new Set(graph.keys());
    
    // Normalize start and coordinator addresses
    const normalizedStart = startAddr.toLowerCase();
    const normalizedCoordinator = coordinatorAddr.toLowerCase();
    

    
    if (!graph.has(normalizedStart)) {
      console.error('[Zigbee Floorplan] Start address not found in graph!');
      return [];
    }
    
    if (!graph.has(normalizedCoordinator)) {
      console.error('[Zigbee Floorplan] Coordinator address not found in graph!');
      return [];
    }
    
    distances.set(normalizedStart, 0);
    
    let iterations = 0;
    while (unvisited.size > 0) {
      iterations++;
      
      // Find node with minimum distance
      let current = null;
      let minDist = Infinity;
      for (const node of unvisited) {
        const dist = distances.get(node) ?? Infinity;
        if (dist < minDist) {
          minDist = dist;
          current = node;
        }
      }
      
      if (current === null || minDist === Infinity) break;
      if (current === normalizedCoordinator) break; // Found path to coordinator
      
      unvisited.delete(current);
      
      const neighbors = graph.get(current) || [];
      for (const { node, cost, linkKey } of neighbors) {
        if (!unvisited.has(node)) continue;
        
        const altDist = (distances.get(current) ?? 0) + cost;
        if (altDist < (distances.get(node) ?? Infinity)) {
          distances.set(node, altDist);
          previous.set(node, current);
          previousLink.set(node, linkKey);
        }
      }
    }
    
    // Reconstruct path
    const pathLinks = [];
    let current = normalizedCoordinator;
    while (previous.has(current)) {
      const linkKey = previousLink.get(current);
      if (linkKey) pathLinks.push(linkKey);
      current = previous.get(current);
    }
    return pathLinks;
  }

  renderLinks(links) {
    const svgLinks = [];
    const processedLinks = new Set();

    links.forEach(link => {
      // Handle both old format (sourceIeeeAddr) and new format (source.ieeeAddr)
      const sourceAddr = link.sourceIeeeAddr || (link.source && link.source.ieeeAddr);
      const targetAddr = link.targetIeeeAddr || (link.target && link.target.ieeeAddr);
      
      if (!sourceAddr || !targetAddr) {
        return;
      }
      
      // Create consistent link key (sorted addresses, lowercase)
      const normalizedSource = sourceAddr.toLowerCase();
      const normalizedTarget = targetAddr.toLowerCase();
      const linkKey = [normalizedSource, normalizedTarget].sort().join('-');
      
      // Avoid duplicate links
      if (processedLinks.has(linkKey)) {
        return;
      }
      processedLinks.add(linkKey);

      const sourceCoords = this._config.device_coordinates[sourceAddr];
      const targetCoords = this._config.device_coordinates[targetAddr];

      if (sourceCoords && targetCoords) {
        const lqi = link.lqi || link.linkquality || 0;
        
        // Filter links by LQI threshold
        if (lqi < this._lqiFilter) {
          return;
        }
        const color = this.getLQIColor(lqi);
        const midX = (sourceCoords.x + targetCoords.x) / 2;
        const midY = (sourceCoords.y + targetCoords.y) / 2;
        
        // Determine link class based on selection
        let linkClass = 'link';
        if (this._selectedDevice) {
          if (this._pathLinks.has(linkKey)) {
            linkClass += ' path';
          } else {
            linkClass += ' dimmed';
          }
        }

        svgLinks.push(`
          <line 
            x1="${parseFloat(sourceCoords.x)}" 
            y1="${parseFloat(sourceCoords.y)}" 
            x2="${parseFloat(targetCoords.x)}" 
            y2="${parseFloat(targetCoords.y)}" 
            class="${linkClass}" 
            stroke="${this._escapeHtml(color)}"
          />
        `);

        if (this._config.show_link_lqi) {
          svgLinks.push(`
            <text 
              x="${parseFloat(midX)}" 
              y="${parseFloat(midY)}" 
              class="lqi-label" 
              text-anchor="middle"
            >${parseInt(lqi) || 0}</text>
          `);
        }
      }
    });

    return svgLinks.join('');
  }

  renderDevices(nodes) {
    const svgDevices = [];

    nodes.forEach(node => {
      const ieeeAddr = node.ieeeAddr;
      const coords = this._config.device_coordinates[ieeeAddr];
      
      if (coords) {
        const deviceType = node.type || 'EndDevice'; // Coordinator, Router, EndDevice
        const deviceClass = deviceType === 'Coordinator' ? 'coordinator' : 
                          deviceType === 'Router' ? 'router' : 'end-device';
        const isSelected = this._selectedDevice === ieeeAddr;
        
        // Draw circle
        svgDevices.push(`
          <circle 
            cx="${parseFloat(coords.x)}" 
            cy="${parseFloat(coords.y)}" 
            r="${parseInt(this._config.circle_radius)}" 
            class="device-circle ${deviceClass} ${isSelected ? 'selected' : ''}" 
            data-ieee="${this._escapeHtml(String(ieeeAddr))}"
          />
        `);

        // Draw label
        if (this._config.show_labels) {
          const friendlyName = node.friendlyName || node.friendly_name;
          const label = this.getDeviceLabel(ieeeAddr, friendlyName);
          const safeLabel = this._escapeHtml(String(label));
          svgDevices.push(`
            <text 
              x="${parseFloat(coords.x)}" 
              y="${parseFloat(coords.y) + parseInt(this._config.circle_radius) + 15}" 
              class="device-label" 
              text-anchor="middle"
              style="pointer-events: none;"
            >${safeLabel}</text>
          `);
        }
      }
    });

    return svgDevices.join('');
  }

  getDeviceLabel(ieeeAddr, friendlyName) {
    // Priority 1: Manual override from config
    if (this._config.friendly_names && this._config.friendly_names[ieeeAddr]) {
      return this._config.friendly_names[ieeeAddr];
    }
    
    // Priority 2: Friendly name from Zigbee2MQTT network map
    if (friendlyName) {
      return friendlyName;
    }
    
    // Priority 3: Lookup from device names map
    if (this._deviceNames && this._deviceNames.has(ieeeAddr.toLowerCase())) {
      return this._deviceNames.get(ieeeAddr.toLowerCase());
    }
    
    // Fallback: Use last 4 characters of IEEE address
    return ieeeAddr.slice(-4).toUpperCase();
  }

  getUniqueDevices(links) {
    const deviceMap = new Map();

    links.forEach(link => {
      if (link.source && link.source.ieeeAddr) {
        const addr = link.source.ieeeAddr;
        if (!deviceMap.has(addr)) {
          deviceMap.set(addr, {
            ieeeAddr: addr,
            networkAddress: link.source.networkAddress,
            depth: link.depth,
            relationship: link.relationship
          });
        }
      }
      
      if (link.target && link.target.ieeeAddr) {
        const addr = link.target.ieeeAddr;
        if (!deviceMap.has(addr)) {
          deviceMap.set(addr, {
            ieeeAddr: addr,
            networkAddress: link.target.networkAddress,
            depth: 0, // Targets are often coordinators
            relationship: 0
          });
        }
      }
    });

    return Array.from(deviceMap.values());
  }

  getDeviceType(device) {
    // Coordinator: networkAddress = 0 or depth = 0
    if (device.networkAddress === 0 || device.depth === 0) {
      return 'coordinator';
    }
    
    // Router: relationship = 2 and has routes (check if device routes to others)
    // End device: relationship = 1
    if (device.relationship === 1) {
      return 'end-device';
    }
    
    // Default to router for relationship = 2
    return 'router';
  }

  getLQIColor(lqi) {
    // LQI ranges from 0-255
    // Excellent: 200-255 (green)
    // Good: 150-199 (yellow-green)
    // Fair: 100-149 (orange)
    // Poor: 0-99 (red)
    
    if (lqi >= 200) {
      return '#00cc00'; // Green
    } else if (lqi >= 150) {
      return '#88cc00'; // Yellow-green
    } else if (lqi >= 100) {
      return '#ffaa00'; // Orange
    } else {
      return '#ff3300'; // Red
    }
  }
}

customElements.define('zigbee-floorplan-card', ZigbeeFloorplanCard);

// Register the card with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'zigbee-floorplan-card',
  name: 'Zigbee Floorplan Card',
  description: 'Display Zigbee network topology on a floorplan image'
});
