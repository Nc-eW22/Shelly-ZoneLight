// ⚡ SPARK_LABS — ZoneLight Fun · Brain v3.2
// Shelly Smart Home Challenge 2026 · Video Showcase
// Host: Shelly Presence Gen4 (mJS)
//
// MODE-TEMPLATE DRIVEN: each mode is a KVS key (zl_fun_m_<name>)
// containing preset ID, brightness/transition defaults for WLED
// and dimmer, and per-segment enter/leave property overlays.
// Add new modes by creating a KVS key — zero code changes.
//
// DISPATCH GATE: one HTTP call at a time. Priority: WLED > Dimmer > SFX.
// Coalesce window merges burst WLED events. 250ms cooldown between calls.
//
// SLIDER CONTRACT: mode change sets sliders to template defaults.
// Manual slider adjustment holds until next mode change.
//
// KVS keys:
//   zl_fun_config — {wled_ip, media_ip, dim_ip, dim_id, presence_id,
//                     coalesce_ms, bool_hold_s,
//                     override, am_on, am_off}
//   zl_fun_m_White / zl_fun_m_Rainbow / zl_fun_m_Color Change / zl_fun_m_Fire
//     Each: {ps, base, boost, fin, fout, d_base, d_boost, d_fin, d_fout,
//            enter:{...}, leave:{...}}
//   zl_fun_s_Drums / Guitar / Clap / Fart / Piano — {z1:id, z2:id, ...}

let VERSION = '3.2';
let LP = '[ZLF] ';
let BOOT_GAP = 500;
let THROTTLE = 250;

// Mode names — must match enum:200 options AND KVS key suffixes
let MODE_NAMES = ['White', 'Rainbow', 'Color Change', 'Fire'];

// ── Zone topology ──────────────────────────────────────────────
let ZN = [
    {pz: 201, sg: 4},
    {pz: 202, sg: 3},
    {pz: 203, sg: 2},
    {pz: 204, sg: 1}
];
let S5 = 0;

// ── Fallbacks ──────────────────────────────────────────────────
let FB_C = {
    wled_ip: '192.168.4.175', media_ip: '192.168.4.174',
    dim_ip: '192.168.4.243', dim_id: 0,
    presence_id: 200, coalesce_ms: 80, bool_hold_s: 15,
    override: false, am_on: '', am_off: ''
};
let FB_MT = {
    ps: 1, base: 35, boost: 60, fin: 0.2, fout: 1.5,
    d_base: 35, d_boost: 0, d_fin: 500, d_fout: 1500,
    enter: {}, leave: {}
};

// ── Runtime ────────────────────────────────────────────────────
let C = {};
let MT = {};             // mode templates: {White:{...}, Fire:{...}, ...}
let AM = {};             // active mode template (ref to MT[current])
let SFX = {};
let H = {md: null, sx: null, bo: null, fi: null, fo: null, bb: null, st: null, ac: null};
let ST = {
    lit: false, active: false,
    mode: 'Color Change', sfx: 'Muted',
    lastZn: 0, pir1: false, pir2: false,
    rc: 0, zc: [0, 0, 0, 0]
};
let TM = {bh: null};
let LAST_TK = '';

// ── Unified dispatch gate ──────────────────────────────────────
// Priority: WLED > Dimmer > SFX. One HTTP call at a time.
let Q = {
    busy: false, cool_t: null,
    // WLED buffer
    segs: {}, ps: -1, off: false,
    wDirty: false, hasEnter: false, wTimer: null,
    // Dimmer slot (latest wins)
    dim: null,
    // SFX slot (latest wins)
    sfxUrl: null, sfxLbl: null
};

function wMark(segId, bri, isEnter) {
    let seg = {id: segId, bri: bri};
    let tmpl = isEnter ? (AM.enter || {}) : (AM.leave || {});
    let k;
    for (k in tmpl) { seg[k] = tmpl[k]; }
    Q.segs[String(segId)] = seg;
    if (isEnter) { Q.hasEnter = true; }
    if (Q.wTimer === null) {
        Q.wTimer = Timer.set(C.coalesce_ms || 80, false, function() {
            Q.wTimer = null;
            Q.wDirty = true;
            dispatch();
        });
    }
}
function wPS(ps) {
    Q.ps = ps;
    Q.wDirty = true;
    if (Q.wTimer === null) {
        Q.wTimer = Timer.set(C.coalesce_ms || 80, false, function() {
            Q.wTimer = null;
            dispatch();
        });
    }
}
function wOff() {
    Q.off = true;
    Q.wDirty = true;
    dispatch();
}
function qDim(on, bri, transMs) {
    Q.dim = {on: on, bri: bri, tr: transMs};
    dispatch();
}
function qSfx(url, lbl) {
    Q.sfxUrl = url;
    Q.sfxLbl = lbl;
    dispatch();
}

function dispatch() {
    if (Q.busy || Q.cool_t !== null) { return; }
    if (Q.wDirty) { flushWled(); return; }
    if (Q.dim !== null) { flushDim(); return; }
    if (Q.sfxUrl !== null) { flushSfx(); return; }
}
function afterCall() {
    Q.busy = false;
    Q.cool_t = Timer.set(THROTTLE, false, function() {
        Q.cool_t = null;
        dispatch();
    });
}

function flushWled() {
    Q.busy = true;
    Q.wDirty = false;
    let payload = {};
    let any = false;

    if (Q.off) {
        payload.on = false;
        payload.transition = tU(AM.fout || 1.5);
        Q.off = false;
        Q.segs = {};
        Q.ps = -1;
        Q.hasEnter = false;
        any = true;
    } else {
        payload.on = true;
        payload.bri = 255;
        if (Q.ps !== -1) {
            payload.ps = Q.ps;
            Q.ps = -1;
            any = true;
        }
        let segs = [];
        let id;
        for (id in Q.segs) { segs.push(Q.segs[id]); }
        Q.segs = {};
        if (segs.length > 0) {
            payload.seg = segs;
            any = true;
        }
        payload.transition = Q.hasEnter ? tU(AM.fin || 0.2) : tU(AM.fout || 1.5);
        Q.hasEnter = false;
    }

    if (!any) { Q.busy = false; dispatch(); return; }

    dbg('wled -> ' + JSON.stringify(payload));
    Shelly.call('HTTP.POST', {
        url: 'http://' + C.wled_ip + '/json/state',
        body: JSON.stringify(payload),
        timeout: 2
    }, function(res, err) {
        if (err !== 0) { dbg('wled ERR ' + err); }
        afterCall();
    });
}

function flushDim() {
    if (!C.dim_ip) { Q.dim = null; dispatch(); return; }
    Q.busy = true;
    let d = Q.dim;
    Q.dim = null;
    let url = 'http://' + C.dim_ip + '/rpc/Light.Set?id=' + (C.dim_id || 0);
    url = url + '&on=' + (d.on ? 'true' : 'false');
    if (d.on && typeof d.bri === 'number') { url = url + '&brightness=' + d.bri; }
    if (typeof d.tr === 'number' && d.tr > 0) { url = url + '&transition=' + d.tr; }
    dbg('dim -> on=' + d.on + ' bri=' + d.bri + ' tr=' + d.tr);
    Shelly.call('HTTP.GET', {url: url, timeout: 3}, function(r, e) {
        if (e !== 0) { dbg('dim ERR ' + e); }
        afterCall();
    });
}

function flushSfx() {
    Q.busy = true;
    let url = Q.sfxUrl;
    let lbl = Q.sfxLbl;
    Q.sfxUrl = null;
    Q.sfxLbl = null;
    dbg('sfx -> ' + lbl);
    Shelly.call('HTTP.GET', {url: url, timeout: 3}, function(r, e) {
        if (e !== 0) { dbg('sfx ERR ' + e); }
        afterCall();
    });
}

// ── Helpers ────────────────────────────────────────────────────
function dbg(m) { console.log(LP + m); }
function safeParse(r) { if (!r) { return null; } try { return JSON.parse(r); } catch(e) { return null; } }
function kvsGet(k, cb) {
    Shelly.call('KVS.Get', {key: k}, function(r, e) {
        if (e !== 0 || !r || r.value === undefined) { cb(null); return; }
        cb(r.value);
    });
}
function parseQ(q) {
    let o = {};
    if (!q) { return o; }
    let p = q.split('&');
    let i;
    for (i = 0; i < p.length; i++) {
        let kv = p[i].split('=');
        if (kv.length === 2) { o[kv[0]] = kv[1]; }
    }
    return o;
}
function zIdx(pz) {
    let i;
    for (i = 0; i < ZN.length; i++) { if (ZN[i].pz === pz) { return i; } }
    return -1;
}
function totObj() {
    let t = 0; let i;
    for (i = 0; i < ST.zc.length; i++) { t = t + ST.zc[i]; }
    return t;
}
function getSrc(e) {
    if (e && e.info && typeof e.info.source !== 'undefined') { return e.info.source; }
    if (e && typeof e.source !== 'undefined') { return e.source; }
    return null;
}
function isSys(e) {
    let s = getSrc(e);
    return (s === 'rpc' || s === 'loopback' || s === 'sys');
}

// ── Brightness ─────────────────────────────────────────────────
function p255(pct) {
    let v = Math.round(pct * 2.55);
    if (v < 1 && pct > 0) { v = 1; }
    if (v > 255) { v = 255; }
    return v;
}
function wAmb() { return p255(AM.base || 35); }
function wAct() {
    let p = (AM.base || 35) + (AM.boost || 60);
    if (p > 100) { p = 100; }
    return p255(p);
}
function tU(s) {
    let u = Math.round(s * 10);
    if (u < 0) { u = 0; }
    return u;
}

// ── Mode application ──────────────────────────────────────────
function copyObj(src) {
    let out = {};
    let k;
    for (k in src) { out[k] = src[k]; }
    return out;
}
function applyMode(name) {
    ST.mode = name;
    let tmpl = MT[name] || FB_MT;
    AM = copyObj(tmpl);
    // enter/leave are nested — copy those too
    AM.enter = tmpl.enter ? copyObj(tmpl.enter) : {};
    AM.leave = tmpl.leave ? copyObj(tmpl.leave) : {};
    // Reset sliders to mode defaults (source = loopback, filtered by handlers)
    if (typeof AM.base === 'number' && H.bb) { H.bb.setValue(AM.base); }
    if (typeof AM.boost === 'number' && H.bo) { H.bo.setValue(AM.boost); }
    if (typeof AM.fin === 'number' && H.fi) { H.fi.setValue(AM.fin); }
    if (typeof AM.fout === 'number' && H.fo) { H.fo.setValue(AM.fout); }
    dbg('applyMode ' + name + ' ps=' + AM.ps + ' base=' + AM.base + '/' + AM.d_base + ' boost=' + AM.boost + '/' + AM.d_boost);
}

// ── SFX ────────────────────────────────────────────────────────
function fireSfx(zoneNum) {
    if (ST.sfx === 'Muted') { return; }
    let mk = (ST.sfx === 'Funny Piano') ? 'Piano' : ST.sfx;
    let t = SFX[mk];
    if (!t) { return; }
    let zk = 'z' + zoneNum;
    let clip = t[zk];
    if (typeof clip === 'undefined') { return; }
    let url = 'http://' + C.media_ip + '/rpc/Media.MediaPlayer.PlayAudioClip?id=' + clip;
    qSfx(url, ST.sfx + '-' + zk);
}

// ── Boolean: speed-on / lazy-off ─────────────���─────────────────
function markActive(src) {
    if (TM.bh !== null) { Timer.clear(TM.bh); TM.bh = null; }
    if (!ST.active) {
        ST.active = true;
        if (H.ac) { H.ac.setValue(true); }
        dbg('bool -> TRUE (' + src + ')');
    }
}
function startBoolHold() {
    if (TM.bh !== null) { Timer.clear(TM.bh); TM.bh = null; }
    dbg('all clear — hold ' + C.bool_hold_s + 's');
    TM.bh = Timer.set(C.bool_hold_s * 1000, false, function() {
        TM.bh = null;
        if (ST.pir1 || ST.pir2 || ST.rc > 0 || totObj() > 0) {
            dbg('hold expired but motion present');
            return;
        }
        ST.active = false;
        if (H.ac) { H.ac.setValue(false); }
        dbg('bool -> FALSE');
        updTk();
    });
}

// ── Status ticker ──────────────────────────────────────────────
function updTk() {
    let s;
    if (ST.active) {
        let z = ST.lastZn > 0 ? ('z' + ST.lastZn) : '?';
        s = '🟢 ' + ST.mode + ' | ' + z + ' | ' + totObj() + 'obj';
    } else {
        s = '⚫ CLEAR';
    }
    if (s !== LAST_TK) {
        LAST_TK = s;
        if (H.st) { H.st.setValue(s); }
    }
}

// ── Corridor on / off ──────────────────────────────────────────
function amPing(url) {
    if (!url) { return; }
    qSfx(url, 'am-ping');   // reuse SFX slot (lowest priority, latest wins)
}
function paintAmbient() {
    ST.lit = true;
    let ps = AM.ps;
    if (typeof ps === 'number') { wPS(ps); }
    let i;
    for (i = 0; i < ZN.length; i++) { wMark(ZN[i].sg, wAmb(), false); }
    wMark(S5, wAmb(), false);
    if (C.override) {
        amPing(C.am_on);
        dbg('ambient ON ps=' + ps + ' wled=' + wAmb() + ' override->AM');
    } else {
        qDim(true, AM.d_base || 35, AM.d_fin || 500);
        dbg('ambient ON ps=' + ps + ' wled=' + wAmb() + ' dim=' + (AM.d_base || 35));
    }
}
function allOff() {
    ST.lit = false;
    wOff();
    if (C.override) {
        amPing(C.am_off);
        dbg('corridor OFF override->AM');
    } else {
        qDim(false, 0, AM.d_fout || 1500);
        dbg('corridor OFF');
    }
}
function checkClear() {
    if (ST.pir1) { dbg('hold: pir1'); return; }
    if (ST.pir2) { dbg('hold: pir2'); return; }
    if (ST.rc > 0) { dbg('hold: rc=' + ST.rc); return; }
    if (totObj() > 0) { dbg('hold: obj=' + totObj()); return; }
    dbg('ALL CLEAR');
    allOff();
    startBoolHold();
    updTk();
}

// ── Presence event router ──────────────────────────────────────
function onPresence(ev) {
    if (!ev || !ev.component) { return; }
    if (ev.component.indexOf('presencezone:') !== 0) { return; }
    let info = ev.info;
    if (!info) { return; }
    let pz = info.id;
    let et = info.event;

    if (pz === C.presence_id) {
        if (et === 'counter') {
            ST.rc = (typeof info.num_objects === 'number') ? info.num_objects : ST.rc;
            dbg('room rc=' + ST.rc);
            if (ST.rc === 0) { checkClear(); }
            updTk();
            return;
        }
        if (et === 'presence') {
            if (info.value === true) {
                markActive('room');
                if (!ST.lit) { paintAmbient(); }
            } else {
                dbg('room clear');
                checkClear();
            }
            updTk();
            return;
        }
        return;
    }

    let idx = zIdx(pz);
    if (idx === -1) { return; }
    let sg = ZN[idx].sg;

    if (et === 'counter') {
        ST.zc[idx] = (typeof info.num_objects === 'number') ? info.num_objects : ST.zc[idx];
        dbg('z' + pz + ' zc=' + ST.zc[idx]);
        updTk();
        return;
    }
    if (et === 'enter') {
        ST.lastZn = pz;
        markActive('z' + pz + '-enter');
        if (!ST.lit) { paintAmbient(); }
        wMark(sg, wAct(), true);
        fireSfx(idx + 1);
        dbg('z' + pz + ' ENTER s' + sg);
        updTk();
        return;
    }
    if (et === 'leave') {
        wMark(sg, wAmb(), false);
        dbg('z' + pz + ' leave s' + sg);
        return;
    }
    if (et === 'presence') {
        if (info.value === true) {
            markActive('z' + pz);
            if (!ST.lit) { paintAmbient(); }
            dbg('z' + pz + ' presence=true');
        } else {
            ST.zc[idx] = 0;
            wMark(sg, wAmb(), false);
            dbg('z' + pz + ' presence=false');
            checkClear();
        }
        updTk();
        return;
    }
}

// ── PIR endpoints ──────────────────────────────────────────────
function epPir(req, res) {
    let q = parseQ(req.query);
    let sid = q.sensor ? Number(q.sensor) : 0;
    if (sid === 1) {
        ST.pir1 = true;
        markActive('pir1');
        if (!ST.lit) { paintAmbient(); }
        wMark(S5, wAct(), true);
        dbg('PIR1 active');
    } else if (sid === 2) {
        ST.pir2 = true;
        markActive('pir2');
        if (!ST.lit) { paintAmbient(); }
        dbg('PIR2 active');
    }
    res.code = 200; res.body = 'OK'; res.send();
}
function epPirEnd(req, res) {
    let q = parseQ(req.query);
    let sid = q.sensor ? Number(q.sensor) : 0;
    if (sid === 1) {
        ST.pir1 = false;
        wMark(S5, wAmb(), false);
        dbg('PIR1 clear');
    } else if (sid === 2) {
        ST.pir2 = false;
        dbg('PIR2 clear');
    }
    Timer.set(250, false, checkClear);
    res.code = 200; res.body = 'OK'; res.send();
}

// ── VC handlers ────────────────────────────────────────────────
function onModeChg(e) {
    if (isSys(e)) { return; }
    let newMode = H.md ? H.md.getValue() : ST.mode;
    applyMode(newMode);
    if (ST.lit) {
        let ps = AM.ps;
        if (typeof ps === 'number') { wPS(ps); }
        let i;
        for (i = 0; i < ZN.length; i++) { wMark(ZN[i].sg, wAmb(), false); }
        wMark(S5, wAmb(), false);
        if (!C.override) { qDim(true, AM.d_base || 35, AM.d_fin || 500); }
    }
    updTk();
}
function onSfxChg(e) {
    if (isSys(e)) { return; }
    if (H.sx) { ST.sfx = H.sx.getValue(); }
    dbg('sfx -> ' + ST.sfx);
}
function onSlider(e) {
    if (isSys(e)) { return; }
    if (H.bo) { AM.boost = H.bo.getValue(); }
    if (H.bb) { AM.base = H.bb.getValue(); }
    if (H.fi) { AM.fin = H.fi.getValue(); }
    if (H.fo) { AM.fout = H.fo.getValue(); }
    dbg('slider boost=' + AM.boost + ' base=' + AM.base + ' fade=' + AM.fin + '/' + AM.fout);
    if (ST.lit) {
        let i;
        for (i = 0; i < ZN.length; i++) { wMark(ZN[i].sg, wAmb(), false); }
        wMark(S5, wAmb(), false);
        if (!C.override) { qDim(true, AM.d_base || 35, AM.d_fin || 500); }
    }
}

// ── Boot ───────────────────────────────────────────────���───────
function boot1() {
    dbg('======================================');
    dbg('ZoneLight Fun Brain v' + VERSION);
    dbg('======================================');
    dbg('[1/6] Config...');
    kvsGet('zl_fun_config', function(v) {
        let c = safeParse(v);
        if (!c || !c.wled_ip) {
            dbg('  config missing — fallback');
            C = FB_C;
        } else {
            C = c;
            if (!C.coalesce_ms) { C.coalesce_ms = FB_C.coalesce_ms; }
            if (!C.bool_hold_s) { C.bool_hold_s = FB_C.bool_hold_s; }
            if (!C.presence_id) { C.presence_id = FB_C.presence_id; }
            if (!C.dim_id && C.dim_id !== 0) { C.dim_id = 0; }
            if (typeof C.override === 'undefined') { C.override = false; }
            if (!C.am_on) { C.am_on = ''; }
            if (!C.am_off) { C.am_off = ''; }
        }
        dbg('  wled=' + C.wled_ip + ' media=' + C.media_ip + ' dim=' + (C.dim_ip || 'none'));
        dbg('  coalesce=' + C.coalesce_ms + 'ms hold=' + C.bool_hold_s + 's override=' + C.override);
        Timer.set(BOOT_GAP, false, boot2);
    });
}
function boot2() {
    dbg('[2/6] Mode templates...');
    let idx = 0;
    function next() {
        if (idx >= MODE_NAMES.length) {
            dbg('  modes ready: ' + MODE_NAMES.length + ' loaded');
            Timer.set(BOOT_GAP, false, boot3);
            return;
        }
        let nm = MODE_NAMES[idx]; idx++;
        kvsGet('zl_fun_m_' + nm, function(v) {
            let t = safeParse(v);
            if (t) {
                if (!t.enter) { t.enter = {}; }
                if (!t.leave) { t.leave = {}; }
                MT[nm] = t;
                dbg('  ' + nm + ' ps=' + t.ps + ' base=' + t.base + '/' + t.d_base);
            } else {
                dbg('  ' + nm + ' missing — fallback');
                MT[nm] = FB_MT;
            }
            next();
        });
    }
    next();
}
function boot3() {
    dbg('[3/6] SFX maps...');
    let names = ['Drums', 'Guitar', 'Clap', 'Fart', 'Piano'];
    let idx = 0;
    function next() {
        if (idx >= names.length) { dbg('  SFX ready'); Timer.set(BOOT_GAP, false, boot4); return; }
        let nm = names[idx]; idx++;
        kvsGet('zl_fun_s_' + nm, function(v) {
            let d = safeParse(v);
            if (d) { SFX[nm] = d; }
            next();
        });
    }
    next();
}
function boot4() {
    dbg('[4/6] Handles...');
    H.md = Virtual.getHandle('enum:200');
    H.sx = Virtual.getHandle('enum:201');
    H.bo = Virtual.getHandle('number:202');
    H.fi = Virtual.getHandle('number:203');
    H.fo = Virtual.getHandle('number:204');
    H.bb = Virtual.getHandle('number:205');
    H.st = Virtual.getHandle('text:200');
    H.ac = Virtual.getHandle('boolean:200');
    // Read current mode from VC, then apply its template
    if (H.md) { let v = H.md.getValue(); if (v) { ST.mode = v; } }
    if (H.sx) { let v = H.sx.getValue(); if (v) { ST.sfx = v; } }
    applyMode(ST.mode);
    dbg('  mode=' + ST.mode + ' sfx=' + ST.sfx);
    Timer.set(BOOT_GAP, false, boot5);
}
function boot5() {
    dbg('[5/6] Endpoints + handlers...');
    ST.active = false;
    if (H.ac) { H.ac.setValue(false); }
    updTk();
    HTTPServer.registerEndpoint('pir', epPir);
    HTTPServer.registerEndpoint('pir_end', epPirEnd);
    if (H.md) { H.md.on('change', onModeChg); }
    if (H.sx) { H.sx.on('change', onSfxChg); }
    if (H.bo) { H.bo.on('change', onSlider); }
    if (H.fi) { H.fi.on('change', onSlider); }
    if (H.fo) { H.fo.on('change', onSlider); }
    if (H.bb) { H.bb.on('change', onSlider); }
    Shelly.addEventHandler(onPresence);
    Shelly.call('WiFi.GetStatus', {}, function(st) {
        let ip = (st && st.sta_ip) ? st.sta_ip : '?';
        let sid = Shelly.getCurrentScriptId();
        let b = 'http://' + ip + '/script/' + sid;
        dbg('  PIR1: ' + b + '/pir?sensor=1  end: ' + b + '/pir_end?sensor=1');
        dbg('  PIR2: ' + b + '/pir?sensor=2  end: ' + b + '/pir_end?sensor=2');
        Timer.set(BOOT_GAP, false, boot6);
    });
}
function boot6() {
    dbg('[6/6] Sensor check...');
    let anyActive = false;
    let idx = 0;
    function pollNext() {
        if (idx >= ZN.length) {
            if (anyActive && !ST.lit) {
                dbg('  boot: presence -> ambient ON');
                paintAmbient();
            }
            dbg('======================================');
            dbg('✅ ONLINE v' + VERSION + ' mode=' + ST.mode);
            dbg('======================================');
            return;
        }
        let ci = idx; idx++;
        Shelly.call('Shelly.GetComponentStatus', {id: 'presencezone:' + ZN[ci].pz}, function(res, err) {
            if (err === 0 && res) {
                let hasP = false;
                if (res.presence === true) { hasP = true; }
                if (typeof res.num_objects === 'number' && res.num_objects > 0) { hasP = true; }
                if (hasP) {
                    dbg('  boot: z' + ZN[ci].pz + ' occupied');
                    ST.zc[ci] = res.num_objects || 1;
                    markActive('boot-z' + ZN[ci].pz);
                    anyActive = true;
                }
            }
            pollNext();
        });
    }
    pollNext();
}

function init() { Timer.set(BOOT_GAP, false, boot1); }
init();