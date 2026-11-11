(function () {
  "use strict";

  var CFG = window.MW_CONFIG;
  var AREAS = CFG.areas.map(function (a) { return a.name; });
  var SECTIONS = {};
  CFG.areas.forEach(function (a) { SECTIONS[a.name] = a.sections || []; });
  var ALL = "All of Madibeng";

  var STATUS = {
    water: [["out", "No water"], ["low", "Low pressure"], ["on", "Water is back"]],
    power: [["out", "No power"], ["low", "Dim / unstable"], ["on", "Power is back"]]
  };
  var LABEL = {
    water: { out: "No water", low: "Low pressure", on: "Water on" },
    power: { out: "No power", low: "Unstable", on: "Power on" }
  };
  var RANK = { out: 3, low: 2, on: 1 };
  var HOUR = 3600e3, DAY = 24 * HOUR, STALE = 12 * HOUR;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    util: "water", status: "out", filter: "problems",
    reports: [], notices: [], loaded: false, example: false,
    mod: false, session: null
  };

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  var device = store("mw-device");
  if (!device) {
    device = "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    store("mw-device", device);
  }

  var sb = null;
  try {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  } catch (e) { sb = null; }

  // ---------- Helpers ----------
  function clean(s, max) { return String(s || "").trim().replace(/\s+/g, " ").slice(0, max); }
  function tidySection(s) {
    s = clean(s, 40);
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function clock(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fmtWhen(ms) {
    var d = new Date(ms), days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return days[d.getDay()] + " " + d.getDate() + " " + mon[d.getMonth()] + ", " + clock(ms);
  }
  function ago(t, now) {
    var m = Math.max(0, Math.round((now - t) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.floor(m / 60), r = m % 60;
    return h + " h" + (r && h < 6 ? " " + r + " min" : "") + " ago";
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function msg(id, text, kind) { var m = $(id); m.textContent = text; m.className = "msg" + (kind ? " " + kind : ""); }
  function banner(text) { var b = $("banner"); b.textContent = text || ""; b.hidden = !text; }
  function pressGroup(g, v) {
    Array.prototype.forEach.call(g.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === v)); });
  }
  function placeName(area, section) { return section ? area + ", " + section : area; }

  // ---------- Normalise rows from the database ----------
  function toReport(r) {
    return {
      id: r.id, area: r.area, section: r.section || "", util: r.util, status: r.status,
      eta: r.eta || "", note: r.note || "", by: r.device, t: new Date(r.created_at).getTime()
    };
  }
  function toNotice(n) {
    return {
      id: n.id, area: n.area, section: n.section || "", util: n.util, kind: n.kind, source: n.source,
      start: n.start_at ? new Date(n.start_at).getTime() : 0,
      end: n.end_at ? new Date(n.end_at).getTime() : 0,
      t: new Date(n.created_at).getTime()
    };
  }

  // ---------- Status logic ----------
  // For each area + section + service, the latest report sets the status.
  // "since" walks back through earlier reports with the same status.
  function compute(reports, now) {
    var recent = reports.filter(function (r) { return now - r.t < DAY && STATUS[r.util]; })
      .sort(function (a, b) { return b.t - a.t; });
    var groups = {};
    recent.forEach(function (r) {
      var k = r.area + "|" + r.section + "|" + r.util;
      (groups[k] = groups[k] || []).push(r);
    });
    var areas = {};
    Object.keys(groups).forEach(function (k) {
      var list = groups[k], latest = list[0], since = latest.t, who = {}, eta = "", note = "";
      for (var i = 0; i < list.length && list[i].status === latest.status; i++) {
        since = list[i].t; who[list[i].by || i] = 1;
        if (!eta && list[i].eta) eta = list[i].eta;
        if (!note && list[i].note) note = list[i].note;
      }
      var a = areas[latest.area] = areas[latest.area] || { water: {}, power: {} };
      a[latest.util][latest.section] = {
        section: latest.section, status: latest.status, since: since, last: latest.t,
        count: Object.keys(who).length, eta: eta, note: note, stale: now - latest.t > STALE
      };
    });
    return { areas: areas, recent: recent };
  }
  function isProblem(s) { return !!s && !s.stale && s.status !== "on"; }
  function laneEntries(a, util) { return a ? Object.keys(a[util]).map(function (k) { return a[util][k]; }) : []; }

  // Official notices count from 24 h before they start until 6 h after they end
  // (or 48 h after posting when no end is given).
  function activeNotices(now) {
    return state.notices.filter(function (n) {
      var start = n.start || n.t, end = n.end || (n.t + 2 * DAY);
      return now > start - DAY && now < end + 6 * HOUR;
    }).sort(function (a, b) { return (a.start || a.t) - (b.start || b.t); });
  }
  function noticesFor(area, util, now) {
    return activeNotices(now).filter(function (n) { return n.util === util && (n.area === area || n.area === ALL); });
  }
  function noticeText(n, now) {
    var start = n.start || n.t;
    if (n.kind === "restored") return "Supply restored" + (n.start ? " " + fmtWhen(n.start) : "");
    var lead = n.kind === "maintenance" ? (now < start ? "Planned maintenance " : "Maintenance ") : "Outage ";
    var s = lead + (now < start ? "from " + fmtWhen(start) : "since " + fmtWhen(start));
    if (n.end) s += ", expected back " + fmtWhen(n.end);
    return s;
  }

  // ---------- Report form ----------
  var areaSel = $("area");
  AREAS.forEach(function (a) { areaSel.appendChild(new Option(a, a)); });
  var savedArea = store("mw-area");
  areaSel.value = savedArea && AREAS.indexOf(savedArea) >= 0 ? savedArea : "Letlhabile";

  function knownSections(area) {
    var set = {};
    (SECTIONS[area] || []).forEach(function (s) { set[s] = 1; });
    state.reports.forEach(function (r) { if (r.area === area && r.section) set[r.section] = 1; });
    state.notices.forEach(function (n) { if (n.area === area && n.section) set[n.section] = 1; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
  }

  function drawSectionPicker() {
    var area = areaSel.value, configured = SECTIONS[area] || [];
    var sel = $("section-sel"), txt = $("section-txt");
    var saved = store("mw-section-" + area) || "";
    if (configured.length) {
      sel.textContent = "";
      sel.appendChild(new Option("Whole area / not sure", ""));
      configured.forEach(function (s) { sel.appendChild(new Option(s, s)); });
      sel.value = configured.indexOf(saved) >= 0 ? saved : "";
      sel.hidden = false; txt.hidden = true;
      $("section-label").setAttribute("for", "section-sel");
    } else {
      var dl = $("section-list"); dl.textContent = "";
      knownSections(area).forEach(function (s) { dl.appendChild(new Option(s)); });
      if (document.activeElement !== txt) txt.value = saved;
      sel.hidden = true; txt.hidden = false;
      $("section-label").setAttribute("for", "section-txt");
    }
  }
  function chosenSection() {
    return (SECTIONS[areaSel.value] || []).length ? $("section-sel").value : tidySection($("section-txt").value);
  }

  areaSel.addEventListener("change", function () { store("mw-area", areaSel.value); drawSectionPicker(); render(); });
  $("section-sel").addEventListener("change", function () { store("mw-section-" + areaSel.value, chosenSection()); render(); });
  $("section-txt").addEventListener("change", function () { store("mw-section-" + areaSel.value, chosenSection()); render(); });

  function drawStatus() {
    var g = $("status"); g.textContent = "";
    STATUS[state.util].forEach(function (s) {
      var b = el("button", "s-" + s[0], s[1]);
      b.type = "button"; b.dataset.v = s[0];
      b.setAttribute("aria-pressed", String(s[0] === state.status));
      b.addEventListener("click", function () { state.status = s[0]; pressGroup(g, s[0]); });
      g.appendChild(b);
    });
  }
  $("util").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    state.util = b.dataset.v; pressGroup($("util"), state.util); drawStatus();
    $("send").classList.toggle("power", state.util === "power");
  });
  $("filter").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    state.filter = b.dataset.v; pressGroup($("filter"), state.filter); render();
  });

  $("send").addEventListener("click", function () {
    if (!sb) { msg("send-msg", "Can't reach the report service. Check your connection and reload.", "err"); return; }
    var row = {
      area: areaSel.value, section: chosenSection() || null, util: state.util, status: state.status, device: device
    };
    var eta = $("eta").value; if (eta && state.status !== "on") row.eta = eta.slice(0, 5);
    var note = clean($("note").value, 120); if (note) row.note = note;
    $("send").disabled = true; msg("send-msg", "Sending…");
    sb.from("reports").insert(row).then(function (res) {
      if (res.error) {
        var wait = /wait/i.test(res.error.message || "");
        msg("send-msg", wait ? "You just sent a report. Wait 30 seconds before sending another." : "Report not sent. Check your connection and try again.", "err");
        return;
      }
      msg("send-msg", "Thanks, your report is live.", "ok");
      $("note").value = ""; $("eta").value = "";
      store("mw-section-" + areaSel.value, row.section || "");
      // Show it straight away; the next refresh confirms it.
      state.reports.unshift({ id: null, area: row.area, section: row.section || "", util: row.util, status: row.status, eta: row.eta || "", note: row.note || "", by: device, t: Date.now() });
      state.example = false;
      render(); load();
    }).catch(function () {
      msg("send-msg", "Report not sent. Check your connection and try again.", "err");
    }).then(function () { $("send").disabled = false; });
  });

  // ---------- Rendering ----------
  function lane(util, area, entries, now, mine) {
    var box = el("div", "lane");
    box.appendChild(el("div", "k", util === "water" ? "Water" : "Electricity"));
    var v = el("div", "v"), d = el("div", "d");
    box.appendChild(v); box.appendChild(d);
    var notices = noticesFor(area, util, now);
    var officialEnd = notices.some(function (n) { return n.end; });

    var live = entries.filter(function (s) { return !s.stale; });
    var problems = live.filter(isProblem).sort(function (a, b) { return RANK[b.status] - RANK[a.status] || a.since - b.since; });

    if (!entries.length) {
      v.textContent = "No reports"; d.textContent = "Nothing in the last 24 h";
    } else if (problems.length) {
      var worst = problems[0].status;
      box.className = "lane " + worst;
      var whole = problems.filter(function (s) { return !s.section; }).length;
      v.textContent = LABEL[util][worst] + (whole ? "" : problems.length === 1 ? " in 1 section" : " in " + problems.length + " sections");
    } else if (live.length) {
      box.className = "lane on";
      v.textContent = LABEL[util].on;
    } else {
      v.textContent = "Unconfirmed"; d.textContent = "No new reports for 12 h";
    }

    // One line per section (or the whole area), problems first, your section always shown.
    var rows = entries.slice().sort(function (a, b) {
      if (mine && a.section === mine) return -1; if (mine && b.section === mine) return 1;
      var pa = isProblem(a) ? RANK[a.status] : 0, pb = isProblem(b) ? RANK[b.status] : 0;
      return pb - pa || b.last - a.last;
    });
    if (rows.length) {
      var ul = el("ul", "secs");
      rows.slice(0, 5).forEach(function (s) {
        var li = el("li");
        var cls = s.stale ? "unk" : s.status;
        li.appendChild(el("span", "", (s.section || "Whole area") + ": "));
        li.appendChild(el("span", "st " + cls, LABEL[util][s.status] + (s.stale ? " (unconfirmed)" : "")));
        var bits = [(s.status === "on" ? "back " : "since ") + ago(s.since, now)];
        if (s.count > 1) bits.push(s.count + " people");
        if (s.eta && s.status !== "on" && !officialEnd) bits.push("residents say back " + s.eta);
        if (s.note) bits.push("“" + s.note + "”");
        li.appendChild(el("span", "meta", " · " + bits.join(" · ")));
        ul.appendChild(li);
      });
      if (rows.length > 5) ul.appendChild(el("li", "meta", "+ " + (rows.length - 5) + " more sections"));
      box.appendChild(ul);
    }

    notices.forEach(function (n) {
      var o = el("div", "official");
      o.appendChild(el("span", "badge", "Official"));
      o.appendChild(document.createTextNode((n.section ? n.section + ": " : "") + noticeText(n, now)));
      box.appendChild(o);
    });
    return box;
  }

  function renderNotices(now) {
    var box = $("notices"); box.textContent = "";
    var list = activeNotices(now);
    if (!list.length) { box.appendChild(el("p", "sub tight", "No official notices right now.")); return; }
    list.forEach(function (n) {
      var c = el("div", "notice " + n.util);
      c.appendChild(el("div", "t", placeName(n.area, n.section) + " · " + (n.util === "water" ? "Water" : "Electricity")));
      c.appendChild(el("div", "", noticeText(n, now)));
      c.appendChild(el("div", "s", "Source: " + n.source));
      if (state.mod) c.appendChild(removeButton("notices", n.id, "Remove notice"));
      box.appendChild(c);
    });
  }

  function removeButton(table, id, text) {
    var x = el("button", "x", text); x.type = "button";
    x.addEventListener("click", function () {
      x.disabled = true;
      sb.from(table).delete().eq("id", id).then(function (res) {
        if (res.error) { x.disabled = false; x.textContent = "Couldn't remove, try again"; return; }
        load();
      });
    });
    return x;
  }

  function render() {
    var now = Date.now();
    var res = compute(state.reports, now);
    var names = Object.keys(res.areas);
    var count = function (util) {
      var n = 0;
      names.forEach(function (a) { laneEntries(res.areas[a], util).forEach(function (s) { if (isProblem(s) && s.status === "out") n++; }); });
      return n;
    };
    $("n-water").textContent = state.loaded || state.example ? count("water") : "–";
    $("n-power").textContent = state.loaded || state.example ? count("power") : "–";
    $("n-reports").textContent = state.loaded || state.example ? res.recent.length : "–";
    var cw = count("water"), cp = count("power"), cr = res.recent.length;
    $("l-water").textContent = (cw === 1 ? "place" : "places") + " without water";
    $("l-power").textContent = (cp === 1 ? "place" : "places") + " without power";
    $("l-reports").textContent = (cr === 1 ? "report" : "reports") + " in last 24 h";

    renderNotices(now);

    var myArea = areaSel.value, mySection = chosenSection();
    var hasProblem = function (a) {
      var x = res.areas[a];
      return laneEntries(x, "water").some(isProblem) || laneEntries(x, "power").some(isProblem) ||
        noticesFor(a, "water", now).length > 0 || noticesFor(a, "power", now).length > 0;
    };
    var pool = AREAS.concat(names.filter(function (n) { return AREAS.indexOf(n) < 0; }));
    var show = state.filter === "all" ? pool : pool.filter(hasProblem);
    if (show.indexOf(myArea) < 0) show.push(myArea);
    show.sort(function (a, b) {
      if (a === myArea) return -1; if (b === myArea) return 1;
      return (hasProblem(b) ? 1 : 0) - (hasProblem(a) ? 1 : 0) || a.localeCompare(b);
    });

    var board = $("board"); board.textContent = "";
    if (state.example) board.appendChild(el("div", "example-flag", "Example data, not live reports"));
    show.forEach(function (n) {
      var a = res.areas[n];
      var card = el("article", "area" + (n === myArea ? " mine" : ""));
      var head = el("div", "area-head");
      head.appendChild(el("div", "area-name", n));
      if (n === myArea) head.appendChild(el("span", "tag", mySection ? "Your area · " + mySection : "Your area"));
      var lanes = el("div", "lanes");
      lanes.appendChild(lane("water", n, laneEntries(a, "water"), now, n === myArea ? mySection : ""));
      lanes.appendChild(lane("power", n, laneEntries(a, "power"), now, n === myArea ? mySection : ""));
      card.appendChild(head); card.appendChild(lanes);
      board.appendChild(card);
    });
    if (state.filter !== "all" && show.length === 1 && !hasProblem(myArea)) {
      board.appendChild(el("p", "sub", "No other outages reported right now. If yours is off, report it above."));
    }

    var feed = $("feed"); feed.textContent = "";
    res.recent.slice(0, 20).forEach(function (r) {
      var li = el("li");
      var tm = el("time", "", clock(r.t)); tm.dateTime = new Date(r.t).toISOString();
      var body = el("div");
      body.appendChild(el("span", "dot " + r.status));
      body.appendChild(el("strong", "", placeName(r.area, r.section)));
      body.appendChild(document.createTextNode(" · " + LABEL[r.util][r.status] + (r.note ? " · " + r.note : "")));
      if (state.mod && r.id) { body.appendChild(document.createElement("br")); body.appendChild(removeButton("reports", r.id, "Remove report")); }
      li.appendChild(tm); li.appendChild(body); feed.appendChild(li);
    });
    if (!res.recent.length) feed.appendChild(el("li", "sub", "No reports in the last 24 hours yet."));
  }

  // ---------- Example data, shown only until the first real report ----------
  function exampleReports() {
    var n = Date.now(), m = 60000;
    return [
      { area: "Letlhabile", section: "Block B", util: "water", status: "out", t: n - 26 * m, by: "a", note: "Taps dry since morning", eta: "" },
      { area: "Letlhabile", section: "Block B", util: "water", status: "out", t: n - 5 * 60 * m, by: "b", eta: "18:00", note: "" },
      { area: "Letlhabile", section: "Block A", util: "water", status: "on", t: n - 50 * m, by: "c", eta: "", note: "" },
      { area: "Brits West", section: "", util: "power", status: "out", t: n - 40 * m, by: "d", note: "Substation fault", eta: "" },
      { area: "Mothotlung", section: "", util: "water", status: "low", t: n - 90 * m, by: "e", eta: "", note: "" }
    ];
  }

  // ---------- Loading ----------
  var loading = false;
  function load() {
    if (!sb || loading) return;
    loading = true;
    var since = new Date(Date.now() - DAY).toISOString();
    Promise.all([
      sb.from("reports").select("id,created_at,area,section,util,status,eta,note,device")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
      sb.from("notices").select("*").order("created_at", { ascending: false }).limit(300)
    ]).then(function (out) {
      var r = out[0], n = out[1];
      if (r.error || n.error) throw new Error((r.error || n.error).message);
      state.loaded = true;
      state.reports = (r.data || []).map(toReport);
      state.notices = (n.data || []).map(toNotice);
      state.example = !state.reports.length;
      if (state.example) state.reports = exampleReports();
      banner("");
      drawSectionPicker();
      render();
    }).catch(function () {
      if (!state.loaded) banner("Couldn't load live reports. Check your connection; the page will keep trying.");
    }).then(function () { loading = false; });
  }

  // ---------- Moderators ----------
  var nArea = $("n-area");
  [ALL].concat(AREAS).forEach(function (a) { nArea.appendChild(new Option(a, a)); });
  function drawNoticeSections() {
    var dl = $("n-section-list"); dl.textContent = "";
    knownSections(nArea.value).forEach(function (s) { dl.appendChild(new Option(s)); });
  }
  nArea.addEventListener("change", drawNoticeSections);

  function showModPanel() { $("mod").hidden = false; }
  if (location.hash === "#mod") showModPanel();
  window.addEventListener("hashchange", function () { if (location.hash === "#mod") { showModPanel(); $("mod").scrollIntoView(); } });

  function checkModerator(session) {
    state.session = session || null;
    if (!session) {
      state.mod = false; $("login").hidden = false; $("mod-tools").hidden = true; render(); return;
    }
    sb.rpc("is_moderator").then(function (res) {
      state.mod = !res.error && res.data === true;
      showModPanel();
      $("login").hidden = true; $("mod-tools").hidden = false;
      $("mod-who").textContent = state.mod
        ? "Signed in as " + session.user.email + "."
        : "Signed in as " + session.user.email + ", but this account isn't on the moderator list yet.";
      $("n-send").disabled = !state.mod;
      drawNoticeSections();
      render();
    });
  }

  $("login").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!sb) return;
    msg("login-msg", "Signing in…");
    sb.auth.signInWithPassword({ email: $("m-email").value.trim(), password: $("m-pass").value }).then(function (res) {
      if (res.error) { msg("login-msg", "Sign-in failed. Check the email and password.", "err"); return; }
      msg("login-msg", ""); $("m-pass").value = "";
      checkModerator(res.data.session);
    });
  });
  $("signout").addEventListener("click", function () { sb.auth.signOut().then(function () { checkModerator(null); }); });

  $("n-send").addEventListener("click", function () {
    var start = $("n-start").value ? new Date($("n-start").value) : null;
    var end = $("n-end").value ? new Date($("n-end").value) : null;
    var src = clean($("n-src").value, 140);
    if (src.length < 3) { msg("n-msg", "Add the source, so people can check it.", "err"); return; }
    if (start && end && end <= start) { msg("n-msg", "The end time must be after the start time.", "err"); return; }
    var row = {
      area: nArea.value, section: nArea.value === ALL ? null : (tidySection($("n-section").value) || null),
      util: $("n-util").value, kind: $("n-kind").value, source: src,
      start_at: start ? start.toISOString() : null, end_at: end ? end.toISOString() : null
    };
    $("n-send").disabled = true; msg("n-msg", "Posting…");
    sb.from("notices").insert(row).then(function (res) {
      if (res.error) { msg("n-msg", "Not posted. Only moderators can post official notices.", "err"); return; }
      msg("n-msg", "Notice posted.", "ok");
      $("n-start").value = ""; $("n-end").value = ""; $("n-src").value = ""; $("n-section").value = "";
      load();
    }).then(function () { $("n-send").disabled = false; });
  });

  // ---------- Sharing ----------
  var shareUrl = location.origin + location.pathname;
  $("share-wa").href = "https://wa.me/?text=" + encodeURIComponent(
    "Water or power off? Check which areas in Madibeng are affected and report yours: " + shareUrl);
  $("share-copy").addEventListener("click", function () {
    Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(shareUrl)).then(function () {
      msg("share-msg", "Link copied.", "ok");
    }).catch(function () { msg("share-msg", shareUrl); });
  });

  // ---------- Home-screen install ----------
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var dismissed = store("mw-install-dismissed");
  var promptEvent = null;
  if (!standalone && !dismissed) {
    if (isIOS) {
      $("install-text").textContent = "On iPhone: tap the Share button (square with an arrow), then “Add to Home Screen”. It opens like an app.";
      $("install").hidden = false;
    }
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault(); promptEvent = e;
      $("install-btn").hidden = false; $("install").hidden = false;
    });
  }
  $("install-btn").addEventListener("click", function () {
    if (!promptEvent) return;
    promptEvent.prompt();
    promptEvent.userChoice.finally(function () { promptEvent = null; $("install").hidden = true; });
  });
  $("install-close").addEventListener("click", function () { $("install").hidden = true; store("mw-install-dismissed", "1"); });
  window.addEventListener("appinstalled", function () { $("install").hidden = true; });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  // ---------- Start ----------
  drawStatus();
  drawSectionPicker();
  render();
  if (!sb) {
    banner("Couldn't start the report service. Reload the page to try again.");
  } else {
    load();
    sb.auth.getSession().then(function (res) { if (res.data && res.data.session) checkModerator(res.data.session); });
    setInterval(function () { if (!document.hidden) load(); }, 30000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
  }
  setInterval(render, 60000);
})();
