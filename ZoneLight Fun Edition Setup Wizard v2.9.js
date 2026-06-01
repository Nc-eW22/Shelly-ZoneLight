// ⚡ SPARK_LABS — ZoneLight Fun · Setup Wizard v3.2.4
// Video Showcase Release: Production Provisioner, KVS Matrix Seeding, and UI Layout Fixes.

// ── OPERATION TOGGLES ─────────────────────────────────────────
const DELETE_VCS = true;   // Wipe conflicting components first
const DELETE_KVS = false;  // Keep safe unless structural reset required
const SET_KVS    = true;   // Seed/overwrite JSON configurations
const CREATE_VCS = true;   // Build app components from scratch
// ──────────────────────────────────────────────────────────────

// ── SITE_CONFIG ───────────────────────────────────────────────
const SITE_CONFIG = {
    card_title: "ZoneLight Fun Panel",
    wled_ip: "192.168.4.175",
    media_ip: "192.168.4.174",
    dim_ip: "192.168.4.243",
    dim_id: 1,
    presence_id: 200,

    // App Card UI slider defaults
    base_bri: 20,
    boost_pct: 97,
    fade_in_s: 0.7,
    fade_out_s: 1.5,
    
    // Core parameters block
    coalesce_ms: 80,
    bool_hold_s: 15,
    override: true
};

// ── LIGHTING MODE OVERLAY SCHEMA ──────────────────────────────
// Aligned properties via standard alphanumeric keys to prevent JSON token parsing drops.
const MODES = {
    White: { ps: 1, base: 20, boost: 80, fin: 5, fout: 15, d_base: 10, d_boost: 60, d_fin: 300, d_fout: 1500 },
    Rainbow: { ps: 2, base: 15, boost: 97, fin: 7, fout: 20, d_base: 0, d_boost: 0, d_fin: 0, d_fout: 0 },
    Color_Change: { ps: 3, base: 20, boost: 90, fin: 10, fout: 25, d_base: 15, d_boost: 40, d_fin: 500, d_fout: 2000 },
    Fire: { ps: 4, base: 20, boost: 97, fin: 7, fout: 15, d_base: 8, d_boost: 30, d_fin: 400, d_fout: 1500 }
};

// ── ENGINE BUILDER ───────────────────────────────────────────
const VERSION = "3.2.4";
let _q = []; let _qi = 0;

function qadd(method, params, delay_ms) {
    _q.push({ m: method, p: params, d: (delay_ms || 600) });
}

function qrun() {
    if (_qi >= _q.length) { onComplete(); return; }
    let task = _q[_qi]; _qi++;
    if (task.m === '_PAUSE_') {
        console.log('[SETUP] Settle execution window: ' + task.d + 'ms...');
        Timer.set(task.d, false, qrun);
        return;
    }
    Shelly.call(task.m, task.p, function(res, err, msg) {
        if (err !== 0) console.log('[SETUP] Warning: ' + task.m + ' completed step.');
        else console.log('[SETUP] OK -> ' + task.m);
        Timer.set(task.d, false, qrun);
    });
}

function init() {
    console.log('[SETUP] Launching ZoneLight Fun Infrastructure Deck...');
    
    if (DELETE_VCS) {
        qadd('Virtual.Delete', { key: 'enum:200' });
        qadd('Virtual.Delete', { key: 'enum:201' });
        qadd('Virtual.Delete', { key: 'number:202' });
        qadd('Virtual.Delete', { key: 'number:203' });
        qadd('Virtual.Delete', { key: 'number:204' });
        qadd('Virtual.Delete', { key: 'number:205' });
        qadd('Virtual.Delete', { key: 'boolean:200' });
        qadd('Virtual.Delete', { key: 'text:200' });
        qadd('Virtual.Delete', { key: 'group:200' });
        qadd('_PAUSE_', {}, 1500);
    }

    if (SET_KVS) {
        let coreCfg = {
            wled_ip: SITE_CONFIG.wled_ip, media_ip: SITE_CONFIG.media_ip,
            dim_ip: SITE_CONFIG.dim_ip, dim_id: SITE_CONFIG.dim_id,
            presence_id: SITE_CONFIG.presence_id, coalesce_ms: SITE_CONFIG.coalesce_ms,
            bool_hold_s: SITE_CONFIG.bool_hold_s, override: SITE_CONFIG.override
        };
        qadd('KVS.Set', { key: 'zl_fun_config', value: JSON.stringify(coreCfg) }, 450);
        qadd('KVS.Set', { key: 'zl_fun_m_White', value: JSON.stringify(MODES.White) }, 450);
        qadd('KVS.Set', { key: 'zl_fun_m_Rainbow', value: JSON.stringify(MODES.Rainbow) }, 450);
        qadd('KVS.Set', { key: 'zl_fun_m_Color_Change', value: JSON.stringify(MODES.Color_Change) }, 450);
        qadd('KVS.Set', { key: 'zl_fun_m_Fire', value: JSON.stringify(MODES.Fire) }, 450);
        qadd('_PAUSE_', {}, 1000);
    }

    if (CREATE_VCS) {
        let optModes = ["White", "Rainbow", "Color Change", "Fire", "Error"];
        let optSfx = ["Drums", "Guitar", "Clap", "Fart", "Funny Piano", "Muted"];

        qadd('Virtual.Add', { type: 'enum', id: 200, config: { name: 'Lighting Mode', options: optModes, default_value: 'White' }}, 800);
        qadd('Virtual.Add', { type: 'enum', id: 201, config: { name: 'SFX Style', options: optSfx, default_value: 'Muted' }}, 800);
        qadd('Virtual.Add', { type: 'number', id: 202, config: { name: 'Zone Boost %', default_value: SITE_CONFIG.boost_pct, min: 0, max: 100 }}, 800);
        qadd('Virtual.Add', { type: 'number', id: 203, config: { name: 'Fade In Time', default_value: SITE_CONFIG.fade_in_s, min: 0, max: 3 }}, 800);
        qadd('Virtual.Add', { type: 'number', id: 204, config: { name: 'Fade Out Time', default_value: SITE_CONFIG.fade_out_s, min: 0, max: 3 }}, 800);
        qadd('Virtual.Add', { type: 'number', id: 205, config: { name: 'Base Brightness', default_value: SITE_CONFIG.base_bri, min: 0, max: 100 }}, 800);
        qadd('Virtual.Add', { type: 'boolean', id: 200, config: { name: 'Corridor Active', default_value: false }}, 800);
        qadd('Virtual.Add', { type: 'text', id: 200, config: { name: 'Status Ticker', default_value: 'BOOTING...' }}, 800);
        qadd('Virtual.Add', { type: 'group', id: 200, config: { name: SITE_CONFIG.card_title }}, 800);
        
        qadd('_PAUSE_', {}, 1500);

        qadd('Enum.SetConfig', { id: 200, config: { name: 'Lighting Mode', options: optModes, default_value: 'White', meta: { ui: { view: 'dropdown', icon: 'https://img.icons8.com/?size=100&id=qI5fcGxOZEXX&format=png&color=000000', titles: { 'White': '⚪ White', 'Rainbow': '🌈 Rainbow', 'Color Change': '🎨 Color Change', 'Fire': '🔥 Fire', 'Error': 'Offline⚠️' } } } } }, 700);
        qadd('Enum.SetConfig', { id: 201, config: { name: 'SFX Style', options: optSfx, default_value: 'Muted', meta: { ui: { view: 'dropdown', icon: 'https://img.icons8.com/?size=100&id=Lg6az3eestPF&format=png&color=000000', titles: { 'Drums': '🥁 Drums', 'Guitar': '🎸 Guitar', 'Clap': '👏 Clap', 'Fart': '💨 Fart', 'Funny Piano': '🎹 Funny Piano', 'Muted': '🔇 Muted' } } } } }, 700);
        qadd('Number.SetConfig', { id: 202, config: { name: 'Zone Boost %', min: 0, max: 100, meta: { ui: { view: 'slider', unit: '%', icon: 'https://img.icons8.com/?size=100&id=jqUmHlIb6dXQ&format=png&color=000000', step: 1 } } } }, 700);
        qadd('Number.SetConfig', { id: 203, config: { name: 'Fade In Time', min: 0, max: 3, meta: { ui: { view: 'slider', unit: 's', icon: 'https://img.icons8.com/?size=100&id=CTxlSL95vqiQ&format=png&color=000000', step: 0.1 } } } }, 700);
        qadd('Number.SetConfig', { id: 204, config: { name: 'Fade Out Time', min: 0, max: 3, meta: { ui: { view: 'slider', unit: 's', icon: 'https://img.icons8.com/?size=100&id=s8JLFL0hPXrd&format=png&color=000000', step: 0.1 } } } }, 700);
        qadd('Number.SetConfig', { id: 205, config: { name: 'Base Brightness', min: 0, max: 100, meta: { ui: { view: 'slider', unit: '%', icon: 'https://img.icons8.com/?size=100&id=eJ6vHFk10SX6&format=png&color=000000', step: 1 } } } }, 700);
        qadd('Boolean.SetConfig', { id: 200, config: { name: 'Corridor Active', default_value: false, meta: { ui: { view: 'label', icon: 'https://img.icons8.com/?size=100&id=oqRSAlYllDz5&format=png&color=000000' } } } }, 700);
        qadd('Text.SetConfig', { id: 200, config: { name: 'Status Ticker', max_len: 50, default_value: 'BOOTING...', meta: { ui: { view: 'label', icon: 'https://img.icons8.com/?size=100&id=happeFi6zgL7&format=png&color=000000' } } } }, 700);
        
        let members = ["enum:200", "enum:201", "number:202", "number:203", "number:204", "number:205", "boolean:200", "text:200"];
        qadd('Group.Set', { id: 200, value: members }, 700);
    }

    qrun();
}

function onComplete() {
    console.log('[SETUP] ===============================================');
    console.log('[SETUP] ZONELIGHT FUN MATRIX INFRASTRUCTURE COMPLETE');
    console.log('[SETUP] ===============================================');
    Shelly.call('Script.Stop', { id: Shelly.getCurrentScriptId() });
}

init();
