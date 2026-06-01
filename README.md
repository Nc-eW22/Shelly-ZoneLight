# ⚡ SPARK_LABS: ZoneLight Fun v3.2.1
**Immersive spatial micro-appliance for real-time tracking, multi-zone light routing, and hardware companion handoffs.**

*Current Release: v3.2.1 | Target Hardware: Shelly Presence Gen4*

---

## 🌡️ What is this?

ZoneLight Fun transforms a micro-radar Shelly Presence sensor array into an active spatial controller. It maps human movement coordinates directly across structural layout zones, dynamically illuminating addressable WLED pixel strings while managing real-time companion handoffs to standard electrical dimmers.

---

## 🔧 The Problem

Standard automation platforms cause static room lighting behaviors where entire spaces switch on uniformly. ZoneLight Fun tracks occupants down to individual spatial positions, dynamically shifting color profiles, fading lighting outputs across specific vectors, and routing real-time trigger commands seamlessly.

---

## 📱 Virtual Dashboard Panel

### Components Configuration Layout

| Key Name | Component Type | UI Control View | Active Dashboard Label | Target Metric Function |
|---|---|---|---|---|
| `enum:200` | Virtual Enum | Dropdown List | Lighting Mode | Mode Overlays Controller |
| `enum:201` | Virtual Enum | Dropdown List | SFX Style | Audio Feedback Route Selector |
| `number:205` | Virtual Number | Dynamic Slider | Base Brightness | Ambient Light Floor |
| `number:202` | Virtual Number | Dynamic Slider | Zone Boost % | Occupied Spatial Illuminance |
| `number:203` | Virtual Number | Dynamic Slider | Fade In Time | Vector Entrance Acceleration |
| `number:204` | Virtual Number | Dynamic Slider | Fade Out Time | Vector Clearance Deceleration |
| `boolean:200` | Virtual Boolean | Write-Protected Label | Corridor Active | Spatial State Flag |
| `text:200` | Virtual Text | Write-Protected Label | Status Ticker | Live Monitor Readout |
| `group:200` | Virtual Group | List Container View | ZoneLight Fun Panel | Dashboard UI Frame Group |

---

## 🚀 Deployment Checklist

### Phase 1: Setup Provisioner execution
1. Load `zl_fun_setup.js` inside an empty script slot on your targeted Presence hardware.
2. Edit the `SITE_CONFIG` records to match your active host infrastructure and IP layout addresses.
3. Execute the script once, verify that the installer outputs an unblemished chain of `OK` passes, and safely delete it.

### Phase 2: Runtime Engine activation
1. Load `zl_fun_brain.js` into a permanent script index.
2. Check the **Run on Startup** toggle to active and start the execution loop.
3. Verify that the system logs `[ZL-FUN] ONLINE · VERSION v3.2.1`.

---

## 🤝 Companion Handshake Contract (Advanced Motion Pro)

When `zl_fun_config.override` is verified as `true`, ZoneLight Fun assumes spatial authority over the corridor area while offloading background electrical channel adjustments directly to **Advanced Motion Pro** (running on your main Pro Dimmer unit at `192.168.4.243`):

- **Occupant Enters Corridor Area:** Invokes a local loopback callback to fire `onMotionDetected("zonelight");` on the Dimmer block.
- **Corridor Area Fully Clears:** Invokes a callback to fire `onMotionCleared("zonelight");` on the Dimmer block.

This dynamic division of labor allows the Presence sensor to coordinate complex pixel zone overlays while leaving time-of-day scene rules safely under the direction of the core dimmer.

---

⚡ **SPARK_LABS** — *Turning everyday Shelly devices into truly smart virtual appliances.*