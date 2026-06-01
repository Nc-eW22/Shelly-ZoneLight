// ⚡ SPARK_LABS — ZoneLight Fun · Setup v2.9
// Shelly Smart Home Challenge 2026 · Video Showcase Entry
// Host: Shelly Presence Gen4 (mJS runtime)
//
// Unified provisioner: seeds KVS config + creates the 9-slot app card, then self-stops.
// Four independent toggles — run any combination:
//   Fresh install : SET_KVS + CREATE_VCS
//   Reconfigure   : SET_KVS only (Brain re-reads on restart)
//   Full wipe     : DELETE_VCS + SET_KVS + CREATE_VCS
//
// This is the only script you edit per deployment — edit SITE_CONFIG below.
// The Brain holds NO site values; it reads everything from the KVS this seeds.

// ── OPERATION TOGGLES ─────────────────────────────────────────
const DELETE_VCS = true;   // wipe conflicting legacy VCs first
const DELETE_KVS = false;  // rarely needed — SET_KVS always overwrites
const SET_KVS    = true;
const CREATE_VCS = true;
// ──────────────────────────────────────────────────────────────

// ── SITE_CONFIG — edit this block for each deployment ─────────
const SITE_CONFIG = {
    card_title: 'ZoneLight Fun Panel',
    wled_ip: '192.168.4.175',
    media_ip: '192.168.4.174',
    presence_id: 200,            // room sentinel presencezone id

    // runtime defaults (also seeded as VC slider defaults)
    base_bri: 35,                // Base Brightness %  (0-100)
    zone_boost_pct: 60,          // Zone Boost %       (0-100)
    fade_in_s: 0.2,              // Fade In  (0-3.0s)
    fade_out_s: 1.5,             // Fade Out (0-3.0s)
    coalesce_ms: 80,
    bool_hold_s: 15,             // boolean toggle-after window after all-clear

    // Phase 2 overlay — leave false + blank for standalone challenge build
    advance_motion_override: false,
    dimmer_motion_url: '',       // e.g. http://192.168.4.243/script/1/motion?sensor=zonelight
    dimmer_motion_end_url: '',

    // Lighting modes. solid/palette = colour; fx = WLED effect id.
    // WLED default build: Rainbow=9, Fire 2012=66.
    modes: {
        'White':        { mode: 'solid', col: [255, 200, 150], fx: 0 },
        'Rainbow':      { mode: 'fx', fx: 9 },
        'Color Change': { mode: 'palette', fx: 0 },
        'Fire':         { mode: 'fx', fx: 66 }
    },

    // Palette wave colours (Color Change mode) — restored from v0.7
    palette: [
        [255, 200, 150], [150, 200, 255], [255, 160, 80],
        [180, 255, 150], [220, 150, 255], [255, 220, 100]
    ],

    // Per-style zone -> clip id maps (Wall Display media relay)
    sfx_drums:  { z1: 1,  z2: 2,  z3: 3,  z4: 4  },
    sfx_guitar: { z1: 5,  z2: 6,  z3: 7,  z4: 8  },
    sfx_clap:   { z1: 9,  z2: 10, z3: 11, z4: 12 },
    sfx_fart:   { z1: 13, z2: 14, z3: 15, z4: 16 },
    sfx_piano:  { z1: 17, z2: 18, z3: 19, z4: 20 },

    icons: {
        mode:   'https://img.icons8.com/?size=100&id=lsZBoVE2zMo3&format=png',
        sfx:    'https://img.icons8.com/?size=100&id=48234&format=png',
        boost:  'https://img.icons8.com/?size=100&id=48208&format=png',
        fadein: 'https://img.icons8.com/?size=100&id=48221&format=png',
        fadeout:'https://img.icons8.com/?size=100&id=48223&format=png',
        base:   'https://img.icons8.com/?size=100&id=48220&format=png',
        active: 'https://img.icons8.com/?size=100&id=63688&format=png',
        ticker: 'https://img.icons8.com/?size=100&id=4FL3UKeYVGFI&format=png'
    }
};
// ── DO NOT EDIT BELOW THIS LINE ───────────────────────────────

const VERSION = '2.9';
const MODE_TITLES = { 'White': '⚪ White', 'Rainbow': '🌈 Rainbow', 'Color Change': '🎨 Color Change', 'Fire': '🔥 Fire' };
const SFX_TITLES = { 'Drums': '🥁 Drums', 'Guitar': '🎸 Guitar', 'Clap': '👏 Clap', 'Fart': '💨 Fart', 'Funny Piano': '🎹 Funny Piano', 'Muted': '🔇 Muted' };
const MODE_OPTS = ['White', 'Rainbow', 'Color Change', 'Fire'];
const SFX_OPTS = ['Drums', 'Guitar', 'Clap', 'Fart', 'Funny Piano', 'Muted'];

// keys this project owns (for wipe matching + group membership)
const OWNED = ['enum:200', 'enum:201', 'number:202', 'number:203', 'number:204', 'number:205', 'boolean:200', 'text:200', 'group:200'];

// ── Serial queue (index counter — no shift/splice) ────────────
let _q = []; let _qi = 0;

function log(msg) { console.log('⚡ [SETUP] ' + msg); }

function qadd(method, params, delay_ms) {
    _q.push({ m: method, p: params, d: (delay_ms || 700) });
}

function qrun() {
    if (_qi >= _q.length) { onComplete(); return; }
    let task = _q[_qi]; _qi++;
    if (task.m === '_PAUSE_') {
        log('settling ' + task.d + 'ms...');
        Timer.set(task.d, false, qrun);
        return;
    }
    log('[' + _qi + '/' + _q.length + '] ' + task.m + (task.p && task.p.key ? ' ' + task.p.key : '') + (task.p && typeof task.p.id !== 'undefined' ? ' id=' + task.p.id : ''));
    Shelly.call(task.m, task.p, function(res, err, emsg) {
        if (err !== 0 && task.m !== 'Virtual.Delete') { log('   WARN ' + task.m + ' err=' + err + ' ' + (emsg || '')); }
        Timer.set(task.d, false, qrun);
    });
}

// ── KVS seeding ────────────────────────────────────────────────
function queueKVS() {
    log('queueing KVS config seed...');
    let core = {
        wled_ip: SITE_CONFIG.wled_ip,
        media_ip: SITE_CONFIG.media_ip,
        presence_id: SITE_CONFIG.presence_id,
        base_bri: SITE_CONFIG.base_bri,
        zone_boost_pct: SITE_CONFIG.zone_boost_pct,
        fade_in_s: SITE_CONFIG.fade_in_s,
        fade_out_s: SITE_CONFIG.fade_out_s,
        coalesce_ms: SITE_CONFIG.coalesce_ms,
        bool_hold_s: SITE_CONFIG.bool_hold_s,
        advance_motion_override: SITE_CONFIG.advance_motion_override,
        dimmer_motion_url: SITE_CONFIG.dimmer_motion_url,
        dimmer_motion_end_url: SITE_CONFIG.dimmer_motion_end_url
    };
    qadd('KVS.Set', { key: 'zl_fun_config', value: JSON.stringify(core) }, 600);
    qadd('KVS.Set', { key: 'zl_fun_modes', value: JSON.stringify(SITE_CONFIG.modes) }, 600);
    qadd('KVS.Set', { key: 'zl_fun_palette', value: JSON.stringify(SITE_CONFIG.palette) }, 600);
    qadd('KVS.Set', { key: 'zl_fun_s_Drums', value: JSON.stringify(SITE_CONFIG.sfx_drums) }, 600);
    qadd('KVS.Set', { key: 'zl_fun_s_Guitar', value: JSON.stringify(SITE_CONFIG.sfx_guitar) }, 600);
    qadd('KVS.Set', { key: 'zl_fun_s_Clap', value: JSON.stringify(SITE_CONFIG.sfx_clap) }, 600);
    qadd('KVS.Set', { key: 'zl_fun_s_Fart', value: JSON.stringify(SITE_CONFIG.sfx_fart) }, 600);
    qadd('KVS.Set', { key: 'zl_fun_s_Piano', value: JSON.stringify(SITE_CONFIG.sfx_piano) }, 600);
    qadd('KVS.Set', { key: 'zl_fun_schema', value: String(VERSION) }, 600);
}

function queueDeleteKVS() {
    log('queueing KVS delete...');
    let keys = ['zl_fun_config', 'zl_fun_modes', 'zl_fun_palette', 'zl_fun_s_Drums', 'zl_fun_s_Guitar', 'zl_fun_s_Clap', 'zl_fun_s_Fart', 'zl_fun_s_Piano', 'zl_fun_schema'];
    let i;
    for (i = 0; i < keys.length; i++) { qadd('KVS.Delete', { key: keys[i] }, 400); }
}

// ── VC creation (two-phase: Add skeletons -> SetConfig meta) ───
function queueVCs() {
    log('queueing VC skeletons...');
    qadd('Virtual.Add', { type: 'enum', id: 200, config: { name: 'Lighting Mode', options: MODE_OPTS, default_value: 'Color Change' } }, 800);
    qadd('Virtual.Add', { type: 'enum', id: 201, config: { name: 'SFX Style', options: SFX_OPTS, default_value: 'Muted' } }, 800);
    qadd('Virtual.Add', { type: 'number', id: 202, config: { name: 'Zone Boost %', min: 0, max: 100, default_value: SITE_CONFIG.zone_boost_pct } }, 800);
    qadd('Virtual.Add', { type: 'number', id: 203, config: { name: 'Fade In Time', min: 0, max: 3.0, default_value: SITE_CONFIG.fade_in_s } }, 800);
    qadd('Virtual.Add', { type: 'number', id: 204, config: { name: 'Fade Out Time', min: 0, max: 3.0, default_value: SITE_CONFIG.fade_out_s } }, 800);
    qadd('Virtual.Add', { type: 'number', id: 205, config: { name: 'Base Brightness', min: 0, max: 100, default_value: SITE_CONFIG.base_bri } }, 800);
    qadd('Virtual.Add', { type: 'boolean', id: 200, config: { name: 'Corridor Active', default_value: false } }, 800);
    qadd('Virtual.Add', { type: 'text', id: 200, config: { name: 'Status Ticker', default_value: 'BOOTING' } }, 800);
    qadd('Virtual.Add', { type: 'group', id: 200, config: { name: SITE_CONFIG.card_title } }, 800);

    qadd('_PAUSE_', {}, 2000);

    log('queueing VC meta config...');
    qadd('Enum.SetConfig', { id: 200, config: { name: 'Lighting Mode', options: MODE_OPTS, default_value: 'Color Change', meta: { ui: { view: 'dropdown', titles: MODE_TITLES, icon: SITE_CONFIG.icons.mode } } } }, 700);
    qadd('Enum.SetConfig', { id: 201, config: { name: 'SFX Style', options: SFX_OPTS, default_value: 'Muted', meta: { ui: { view: 'dropdown', titles: SFX_TITLES, icon: SITE_CONFIG.icons.sfx } } } }, 700);
    qadd('Number.SetConfig', { id: 202, config: { name: 'Zone Boost %', min: 0, max: 100, meta: { ui: { view: 'slider', unit: '%', step: 1, icon: SITE_CONFIG.icons.boost } } } }, 700);
    qadd('Number.SetConfig', { id: 203, config: { name: 'Fade In Time', min: 0, max: 3.0, meta: { ui: { view: 'slider', unit: 's', step: 0.1, icon: SITE_CONFIG.icons.fadein } } } }, 700);
    qadd('Number.SetConfig', { id: 204, config: { name: 'Fade Out Time', min: 0, max: 3.0, meta: { ui: { view: 'slider', unit: 's', step: 0.1, icon: SITE_CONFIG.icons.fadeout } } } }, 700);
    qadd('Number.SetConfig', { id: 205, config: { name: 'Base Brightness', min: 0, max: 100, meta: { ui: { view: 'slider', unit: '%', step: 1, icon: SITE_CONFIG.icons.base } } } }, 700);
    qadd('Boolean.SetConfig', { id: 200, config: { name: 'Corridor Active', meta: { ui: { view: 'toggle', icon: SITE_CONFIG.icons.active } } } }, 700);
    qadd('Text.SetConfig', { id: 200, config: { name: 'Status Ticker', meta: { ui: { view: 'label', icon: SITE_CONFIG.icons.ticker } } } }, 700);

    qadd('_PAUSE_', {}, 1500);

    log('queueing group membership...');
    qadd('Group.Set', { id: 200, value: ['enum:200', 'enum:201', 'number:202', 'number:203', 'number:204', 'number:205', 'boolean:200', 'text:200'] }, 700);
}

// ── Dynamic VC discovery for deletion ──────────────────────────
function isOwned(key) {
    let i;
    for (i = 0; i < OWNED.length; i++) { if (key === OWNED[i]) { return true; } }
    return false;
}

function discoverAndQueueDeletes(cb) {
    log('scanning existing dynamic components for wipe...');
    Shelly.call('Shelly.GetComponents', { dynamic_only: true }, function(res, err) {
        let comps = (res && res.components) ? res.components : [];
        let found = 0; let i;
        for (i = 0; i < comps.length; i++) {
            let key = comps[i].key;
            if (isOwned(key)) {
                log('   -> queued for delete: ' + key);
                qadd('Virtual.Delete', { key: key }, 500);
                found++;
            }
        }
        if (found === 0) { log('   -> no conflicting VCs found'); }
        else { qadd('_PAUSE_', {}, 1500); }
        cb(found);
    });
}

// ── Preflight ──────────────────────────────────────────────────
function preflight(cb) {
    if (SITE_CONFIG.wled_ip.indexOf('x.x') !== -1 || SITE_CONFIG.media_ip.indexOf('x.x') !== -1) {
        log('ABORT: SITE_CONFIG still contains placeholder IPs. Edit before running.');
        return;
    }
    cb();
}

// ── Build + run ────────────────────────────────────────────────
function build() {
    if (DELETE_VCS) {
        discoverAndQueueDeletes(function() {
            if (DELETE_KVS) { queueDeleteKVS(); }
            if (SET_KVS) { queueKVS(); }
            if (SET_KVS || CREATE_VCS) { qadd('_PAUSE_', {}, 2000); }
            if (CREATE_VCS) { queueVCs(); }
            launch();
        });
        return;
    }
    if (DELETE_KVS) { queueDeleteKVS(); }
    if (SET_KVS) { queueKVS(); }
    if (SET_KVS || CREATE_VCS) { qadd('_PAUSE_', {}, 2000); }
    if (CREATE_VCS) { queueVCs(); }
    launch();
}

function launch() {
    log('pipeline compiled: ' + _q.length + ' tasks');
    Timer.set(800, false, qrun);
}

function onComplete() {
    log('========================================================');
    log('✅ ZONELIGHT FUN SETUP COMPLETE');
    log('   KVS seeded, ' + (CREATE_VCS ? '9 VCs provisioned' : 'VCs untouched') + '.');
    log('   Now load the Brain (ZoneLight_Fun_Brain_v2_9) and run it.');
    log('========================================================');
    Shelly.call('Script.Stop', { id: Shelly.getCurrentScriptId() });
}

function init() {
    log('========================================================');
    log('⚡ SPARK_LABS ZoneLight Fun Setup v' + VERSION);
    log('   toggles: DEL_VCS=' + DELETE_VCS + ' DEL_KVS=' + DELETE_KVS + ' SET_KVS=' + SET_KVS + ' CREATE_VCS=' + CREATE_VCS);
    log('========================================================');
    preflight(build);
}

init();