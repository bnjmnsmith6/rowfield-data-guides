/* Pure sample-bill and Google Form link rules for Clear the Bill.
   No network, no storage, no email. A link is built only from a validated
   public docs.google.com viewform URL supplied in config.js. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ClearTheBill = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /* Labels match the published Google Form checkbox options exactly, including the colon. */
  var SAMPLES = [
    { id: "utility-a", label: "SAMPLE utility bill A: $40", kind: "utility", cents: 4000 },
    { id: "utility-b", label: "SAMPLE utility bill B: $65", kind: "utility", cents: 6500 },
    { id: "medical-c", label: "SAMPLE medical bill C: $90", kind: "medical", cents: 9000 },
    { id: "medical-d", label: "SAMPLE medical bill D: $120", kind: "medical", cents: 12000 }
  ];

  var FREE_SAMPLE = "Free research prototype. SAMPLE bills only.";
  var NO_MONEY = "No donation, payment, or bill payment happens here. Joining does not move money.";

  var COPY = {
    freeSample: FREE_SAMPLE,
    noMoney: NO_MONEY,
    unconfiguredBanner: FREE_SAMPLE + " " + NO_MONEY + " Signups are not being collected. The research form is not connected.",
    unconfiguredStatus: "Signups are not being collected. The research form link is not configured, so this page cannot record an email or a sample bundle. A click here is not a signup. " + FREE_SAMPLE + " " + NO_MONEY,
    invalidBanner: FREE_SAMPLE + " " + NO_MONEY + " Signups are not being collected. The form link is not usable yet.",
    invalidStatus: "Signups are not being collected. A form link is present but it is not a usable public Google Form link, so nothing is recorded. " + FREE_SAMPLE + " " + NO_MONEY,
    configuredBanner: FREE_SAMPLE + " " + NO_MONEY + " The research form opens in a new tab. This page does not store a signup or a sample bundle.",
    configuredStatus: "A selection on this page is not a signup and is not a completed sample bundle. Those exist only after you submit the research form. Enter your email and the no-payment acknowledgement on that form yourself. This page does not store your email or your selection, and it cannot confirm a response. " + FREE_SAMPLE + " " + NO_MONEY
  };

  var VIEWFORM = /^\/forms\/(?:u\/\d+\/)?d\/e\/([A-Za-z0-9_-]+)\/viewform$/;
  var EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

  function sampleById(id) {
    for (var i = 0; i < SAMPLES.length; i++) {
      if (SAMPLES[i].id === id) return SAMPLES[i];
    }
    return null;
  }

  function normalizeSelection(ids) {
    var wanted = Object.create(null);
    var list = Array.isArray(ids) ? ids : [];
    for (var i = 0; i < list.length; i++) wanted[list[i]] = true;
    var ordered = [];
    for (var j = 0; j < SAMPLES.length; j++) {
      if (wanted[SAMPLES[j].id]) ordered.push(SAMPLES[j].id);
    }
    return ordered;
  }

  function sumCents(ids) {
    var ordered = normalizeSelection(ids);
    var total = 0;
    for (var i = 0; i < ordered.length; i++) total += sampleById(ordered[i]).cents;
    return total;
  }

  function formatDollars(cents) {
    if (!Number.isInteger(cents) || cents < 0) throw new Error("cents must be a non-negative integer");
    var dollars = Math.floor(cents / 100);
    var rem = cents % 100;
    if (rem === 0) return "$" + dollars;
    return "$" + dollars + "." + String(rem).padStart(2, "0");
  }

  function formatTotal(ids) {
    return "SAMPLE total: " + formatDollars(sumCents(ids));
  }

  function formatSummary(ids, configured) {
    var count = normalizeSelection(ids).length;
    if (count === 0) {
      return configured
        ? "No sample bills selected. Select at least one invented sample to prepare a bundle link."
        : "No sample bills selected.";
    }
    return count === 1 ? "1 sample bill selected." : count + " sample bills selected.";
  }

  function resetSelection() {
    return [];
  }

  function isBlank(value) {
    return typeof value !== "string" || value.trim() === "";
  }

  function parseViewform(raw) {
    if (isBlank(raw)) return null;
    var url;
    try {
      url = new URL(raw.trim());
    } catch (err) {
      return null;
    }
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.hostname !== "docs.google.com") return null;
    if (url.hash) return null;
    var match = url.pathname.match(VIEWFORM);
    if (!match) return null;
    return { url: url, formId: match[1] };
  }

  function containsEmail(url) {
    if (EMAIL.test(url.pathname)) return true;
    var pairs = Array.from(url.searchParams.entries());
    for (var i = 0; i < pairs.length; i++) {
      if (EMAIL.test(pairs[i][0]) || EMAIL.test(pairs[i][1])) return true;
    }
    return false;
  }

  function refused(reason) {
    return { configured: false, reason: reason };
  }

  function assessConfig(config) {
    if (!config || typeof config !== "object") return refused("unconfigured");
    var responderBlank = isBlank(config.responderUrl);
    var prefillBlank = isBlank(config.samplePrefillUrl);
    if (responderBlank && prefillBlank) return refused("unconfigured");
    var responder = parseViewform(config.responderUrl);
    var prefill = parseViewform(config.samplePrefillUrl);
    if (!responder) return refused(responderBlank ? "incomplete" : "invalid-responder");
    if (!prefill) return refused(prefillBlank ? "incomplete" : "invalid-prefill");
    if (containsEmail(responder.url) || containsEmail(prefill.url)) return refused("refused-email-in-url");
    if (responder.formId !== prefill.formId) return refused("form-mismatch");

    var entryKey = "";
    var matched = 0;
    var pairs = Array.from(prefill.url.searchParams.entries());
    for (var i = 0; i < pairs.length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (!key.startsWith("entry.")) continue;
      if (value === "") continue;
      if (!/^entry\.\d+$/.test(key)) return refused("bad-entry");
      var known = false;
      for (var s = 0; s < SAMPLES.length; s++) {
        if (SAMPLES[s].label === value) known = true;
      }
      if (!known) return refused("prefill-not-a-sample");
      if (entryKey && entryKey !== key) return refused("prefill-must-select-one-sample");
      entryKey = key;
      matched += 1;
    }
    if (matched < 1) return refused("prefill-must-select-one-sample");

    var joinUrl;
    if (!hasEntryParam(responder.url)) {
      joinUrl = config.responderUrl.trim();
    } else {
      var join = new URL(responder.url.origin + responder.url.pathname);
      var kept = Array.from(responder.url.searchParams.entries());
      for (var k = 0; k < kept.length; k++) {
        if (kept[k][0].startsWith("entry.")) continue;
        join.searchParams.append(kept[k][0], kept[k][1]);
      }
      joinUrl = join.toString();
    }
    return {
      configured: true,
      reason: "ready",
      formId: responder.formId,
      entryKey: entryKey,
      joinUrl: joinUrl,
      viewformUrl: responder.url.origin + responder.url.pathname
    };
  }

  function hasEntryParam(url) {
    var keys = Array.from(url.searchParams.keys());
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].startsWith("entry.")) return true;
    }
    return false;
  }

  /* Google's prefilled-link UI leaves ":" and "$" literal and encodes spaces as "+". */
  function encodeFormValue(value) {
    return encodeURIComponent(value).replace(/%20/g, "+").replace(/%3A/gi, ":").replace(/%24/g, "$");
  }

  function isNavigableFormUrl(href) {
    var parsed = parseViewform(href);
    if (!parsed) return false;
    if (containsEmail(parsed.url)) return false;
    return true;
  }

  function buildBundleUrl(config, ids) {
    var assessed = assessConfig(config);
    if (!assessed.configured) return null;
    var selected = normalizeSelection(ids);
    if (selected.length === 0) return null;
    var parts = ["usp=pp_url"];
    for (var i = 0; i < selected.length; i++) {
      parts.push(
        assessed.entryKey + "=" + encodeFormValue(sampleById(selected[i]).label)
      );
    }
    var href = assessed.viewformUrl + "?" + parts.join("&");
    if (!isNavigableFormUrl(href)) return null;
    return href;
  }

  function buildJoinUrl(config) {
    var assessed = assessConfig(config);
    if (!assessed.configured) return null;
    return assessed.joinUrl;
  }

  function linkState(config, ids) {
    var assessed = assessConfig(config);
    var selected = normalizeSelection(ids);
    if (!assessed.configured) {
      var blank = assessed.reason === "unconfigured";
      return {
        configured: false,
        reason: assessed.reason,
        banner: blank ? COPY.unconfiguredBanner : COPY.invalidBanner,
        status: blank ? COPY.unconfiguredStatus : COPY.invalidStatus,
        total: formatTotal(selected),
        summary: formatSummary(selected, false),
        review: { href: null, detail: "Unavailable until the form is connected" },
        join: { href: null, detail: "Unavailable until the form is connected" }
      };
    }
    var bundle = buildBundleUrl(config, selected);
    return {
      configured: true,
      reason: "ready",
      banner: COPY.configuredBanner,
      status: COPY.configuredStatus,
      total: formatTotal(selected),
      summary: formatSummary(selected, true),
        review: {
        href: bundle,
        detail: bundle
          ? "Opens the research form in a new tab with the selected samples filled in for you to review and submit. " + NO_MONEY
          : "Select at least one sample first"
      },
      join: {
        href: buildJoinUrl(config),
        detail: "Opens the research form in a new tab with no sample boxes filled in. " + NO_MONEY
      }
    };
  }

  return {
    SAMPLES: SAMPLES,
    COPY: COPY,
    sampleById: sampleById,
    normalizeSelection: normalizeSelection,
    sumCents: sumCents,
    formatDollars: formatDollars,
    formatTotal: formatTotal,
    formatSummary: formatSummary,
    resetSelection: resetSelection,
    assessConfig: assessConfig,
    buildBundleUrl: buildBundleUrl,
    buildJoinUrl: buildJoinUrl,
    isNavigableFormUrl: isNavigableFormUrl,
    encodeFormValue: encodeFormValue,
    linkState: linkState
  };
});
