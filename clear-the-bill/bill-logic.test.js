const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const logic = require("./bill-logic.js");

const dir = __dirname;
const FORM_ID = "1FAIpQLSemQaalQ9ghaCQBVQFiJEhNLUEKsBa6YcYudIYlBLE8c1_CXA";
const RESPONDER = "https://docs.google.com/forms/d/e/" + FORM_ID + "/viewform?usp=publish-editor";
const PREFILL = "https://docs.google.com/forms/d/e/" + FORM_ID + "/viewform?usp=pp_url"
  + "&entry.1405724595=SAMPLE+utility+bill+A:+$40"
  + "&entry.1405724595=SAMPLE+utility+bill+B:+$65"
  + "&entry.1405724595=SAMPLE+medical+bill+C:+$90"
  + "&entry.1405724595=SAMPLE+medical+bill+D:+$120";

function readConfig() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(dir, "config.js"), "utf8"), context, { filename: "config.js" });
  return context.window.CLEAR_THE_BILL_CONFIG;
}

function subsets(ids) {
  const out = [[]];
  for (const id of ids) {
    const extra = out.map(function (set) { return set.concat(id); });
    out.push.apply(out, extra);
  }
  return out;
}

test("sample amounts, sums, empty selection, and reset", function () {
  assert.deepEqual(logic.SAMPLES.map(function (sample) { return [sample.id, sample.cents]; }), [
    ["utility-a", 4000],
    ["utility-b", 6500],
    ["medical-c", 9000],
    ["medical-d", 12000]
  ]);
  assert.deepEqual(logic.SAMPLES.map(function (sample) { return sample.label; }), [
    "SAMPLE utility bill A: $40",
    "SAMPLE utility bill B: $65",
    "SAMPLE medical bill C: $90",
    "SAMPLE medical bill D: $120"
  ]);
  const ids = logic.SAMPLES.map(function (sample) { return sample.id; });
  for (const selected of subsets(ids)) {
    const expected = selected.reduce(function (sum, id) {
      return sum + logic.sampleById(id).cents;
    }, 0);
    assert.equal(logic.sumCents(selected), expected);
    assert.equal(logic.sumCents(selected.concat(selected)), expected);
  }
  assert.equal(logic.sumCents([]), 0);
  assert.equal(logic.sumCents(null), 0);
  assert.equal(logic.sumCents(["utility-a", "missing"]), 4000);
  assert.equal(logic.formatTotal([]), "SAMPLE total: $0");
  assert.equal(logic.formatTotal(["utility-a", "utility-b"]), "SAMPLE total: $105");
  assert.equal(logic.formatTotal(["utility-a", "utility-b", "medical-c", "medical-d"]), "SAMPLE total: $315");
  assert.equal(logic.formatDollars(4000), "$40");
  assert.equal(logic.formatDollars(12000), "$120");
  assert.deepEqual(logic.resetSelection(["utility-a", "medical-d"]), []);
  assert.equal(logic.sumCents(logic.resetSelection(["medical-c", "medical-d"])), 0);
  assert.equal(logic.formatSummary([], false), "No sample bills selected.");
  assert.equal(
    logic.formatSummary([], true),
    "No sample bills selected. Select at least one invented sample to prepare a bundle link."
  );
  assert.equal(logic.formatSummary(["medical-c"], true), "1 sample bill selected.");
  assert.equal(logic.formatSummary(["utility-b", "medical-d"], true), "2 sample bills selected.");
});

test("published form config and generated link encoding", function () {
  const config = readConfig();
  assert.equal(config.responderUrl, RESPONDER);
  assert.equal(config.samplePrefillUrl, PREFILL);
  const assessed = logic.assessConfig(config);
  assert.equal(assessed.configured, true);
  assert.equal(assessed.reason, "ready");
  assert.equal(assessed.entryKey, "entry.1405724595");
  assert.equal(assessed.formId, FORM_ID);
  assert.equal(logic.buildJoinUrl(config), RESPONDER);
  assert.equal(logic.buildBundleUrl(config, []), null);
  assert.equal(logic.buildBundleUrl(config, ["utility-a", "utility-b", "medical-c", "medical-d"]), PREFILL);

  const pair = logic.buildBundleUrl(config, ["medical-c", "utility-a"]);
  assert.equal(
    pair,
    "https://docs.google.com/forms/d/e/" + FORM_ID + "/viewform?usp=pp_url"
      + "&entry.1405724595=SAMPLE+utility+bill+A:+$40"
      + "&entry.1405724595=SAMPLE+medical+bill+C:+$90"
  );
  const parsed = new URL(pair);
  assert.deepEqual(parsed.searchParams.getAll("entry.1405724595"), [
    "SAMPLE utility bill A: $40",
    "SAMPLE medical bill C: $90"
  ]);
  assert.equal(parsed.searchParams.get("usp"), "pp_url");
  assert.deepEqual(
    [...new Set(parsed.searchParams.keys())].filter(function (key) { return key.startsWith("entry."); }),
    ["entry.1405724595"]
  );
  assert.equal(pair.includes("medical+bill+D"), false);
  assert.equal(pair.includes("@"), false);
  assert.equal(logic.isNavigableFormUrl(pair), true);
  assert.equal(logic.isNavigableFormUrl(RESPONDER), true);

  const empty = logic.linkState(config, []);
  assert.equal(empty.configured, true);
  assert.equal(empty.review.href, null);
  assert.equal(empty.join.href, RESPONDER);
  assert.equal(empty.total, "SAMPLE total: $0");
  assert.match(empty.summary, /No sample bills selected/);

  const chosen = logic.linkState(config, ["utility-b"]);
  assert.equal(chosen.review.href, logic.buildBundleUrl(config, ["utility-b"]));
  assert.match(chosen.review.detail, /new tab/);
  assert.match(chosen.review.detail, /Joining does not move money/);
  assert.match(chosen.join.detail, /Joining does not move money/);
  assert.match(empty.join.detail, /No donation, payment, or bill payment happens here/);
  assert.match(empty.banner, /SAMPLE bills only/);
  assert.equal(chosen.join.href, RESPONDER);
  assert.equal(chosen.status, logic.COPY.configuredStatus);
});

test("unconfigured, incomplete, and unsafe form links stay off", function () {
  const blank = logic.linkState({ responderUrl: "", samplePrefillUrl: "" }, ["utility-a"]);
  assert.equal(blank.configured, false);
  assert.equal(blank.reason, "unconfigured");
  assert.equal(blank.review.href, null);
  assert.equal(blank.join.href, null);
  assert.equal(blank.status, logic.COPY.unconfiguredStatus);
  assert.match(blank.banner, /Signups are not being collected/);
  assert.match(blank.banner, /Joining does not move money/);

  const responderOnly = logic.linkState({ responderUrl: RESPONDER, samplePrefillUrl: "  " }, ["utility-a"]);
  assert.equal(responderOnly.configured, false);
  assert.equal(responderOnly.review.href, null);
  assert.equal(responderOnly.join.href, null);

  const badHost = logic.assessConfig({
    responderUrl: "https://forms.gle/not-a-form",
    samplePrefillUrl: PREFILL
  });
  assert.equal(badHost.configured, false);
  assert.equal(logic.buildBundleUrl({
    responderUrl: "http://docs.google.com/forms/d/e/" + FORM_ID + "/viewform",
    samplePrefillUrl: PREFILL
  }, ["utility-a"]), null);
  assert.equal(logic.isNavigableFormUrl("javascript:alert(1)"), false);
  assert.equal(logic.isNavigableFormUrl("https://docs.google.com/forms/d/e/fixtureFormId/formResponse"), false);
  assert.equal(logic.isNavigableFormUrl("https://docs.google.com/forms/d/e/fixtureFormId/edit"), false);
  assert.equal(logic.isNavigableFormUrl("https://evil.example/forms/d/e/" + FORM_ID + "/viewform"), false);

  const withEmail = logic.assessConfig({
    responderUrl: RESPONDER,
    samplePrefillUrl: PREFILL + "&entry.999=person@example.com"
  });
  assert.equal(withEmail.reason, "refused-email-in-url");
  assert.equal(logic.buildJoinUrl({
    responderUrl: RESPONDER,
    samplePrefillUrl: PREFILL + "&entry.999=person@example.com"
  }), null);

  const mismatch = logic.assessConfig({
    responderUrl: "https://docs.google.com/forms/d/e/otherFormId/viewform",
    samplePrefillUrl: PREFILL
  });
  assert.equal(mismatch.reason, "form-mismatch");

  const unknownOption = PREFILL.replace("SAMPLE+utility+bill+A:+$40", "SAMPLE+utility+bill+A+$40");
  assert.equal(logic.assessConfig({ responderUrl: RESPONDER, samplePrefillUrl: unknownOption }).reason, "prefill-not-a-sample");
});

test("page shows disclaimers, exact samples, and a disabled bundle link until a selection exists", function () {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  const app = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  const configSource = fs.readFileSync(path.join(dir, "config.js"), "utf8");
  const phrases = [
    "Rowfield Data research project",
    "research prototype",
    "built with AI assistance",
    "invented illustration",
    "No payments or financial assistance are available today.",
    "A future service is not guaranteed.",
    "No company has been formed for this project.",
    "rowfielddata@gmail.com",
    "SAMPLE total: $0",
    "not a signup",
    "cannot confirm a response",
    "no-payment acknowledgement",
    logic.COPY.configuredStatus,
    logic.COPY.configuredBanner,
    logic.COPY.freeSample,
    logic.COPY.noMoney,
    "The Google Form will ask your role: whether you want to help pay others' bills, need help with a bill, or other."
  ];
  for (const phrase of phrases) assert.ok(html.includes(phrase), phrase);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.equal(html.includes("<iframe"), false);
  assert.equal(html.includes("StillBriar"), false);
  assert.equal(html.includes("nonprofit"), false);
  assert.equal(html.includes("tax deductible"), false);
  assert.equal(html.includes("beneficiar"), false);
  for (const sample of logic.SAMPLES) assert.ok(html.includes(sample.label), sample.label);
  assert.equal(html.includes("Signups are not being collected"), false);
  assert.match(html, /id="review-link"[^>]*aria-disabled="true"/);
  assert.equal(/id="review-link"[^>]*\shref=/.test(html), false);
  assert.ok(html.includes('href="' + RESPONDER + '"'));
  assert.match(html, /id="join-link"[^>]*rel="noopener noreferrer"/);
  assert.equal(html.includes("/edit"), false);
  assert.equal(html.includes("formResponse"), false);
  assert.equal(html.includes("embedded=true"), false);
  assert.doesNotMatch(html, /type="(email|password|file|tel|number)"/);
  assert.doesNotMatch(html, /method\s*=\s*["']post/i);
  assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(function (match) { return match[1]; }), [
    "config.js",
    "bill-logic.js",
    "app.js"
  ]);
  assert.match(html, /href="style\.css"/);
  assert.equal(html.includes("localStorage"), false);
  assert.equal(app.includes("localStorage"), false);
  assert.equal(app.includes("sessionStorage"), false);
  assert.equal(app.includes("fetch("), false);
  assert.equal(app.includes("innerHTML"), false);
  assert.equal(app.includes("formResponse"), false);
  assert.equal(configSource.includes("/edit"), false);
  assert.equal(configSource.includes("formResponse"), false);
  assert.equal(configSource.includes("@"), false);
  assert.ok(css.length > 500);

  const measurement = fs.readFileSync(path.join(dir, "MEASUREMENT.md"), "utf8");
  assert.match(measurement, /Ops is adding a role question/);
  assert.match(measurement, /QA responses must be excluded/);
  assert.match(measurement, /Exposure and opportunity logging is ops-side/);
  assert.match(measurement, /does not add an analytics SDK/);
  assert.match(measurement, /14-day clock has not started/);
  assert.match(measurement, /Kill rule, unchanged/);
  assert.equal(measurement.includes("/edit"), false);
  const sources = ["index.html", "app.js", "bill-logic.js", "config.js", "MEASUREMENT.md"].map(function (name) {
    return fs.readFileSync(path.join(dir, name), "utf8");
  }).join("\n");
  assert.deepEqual([...new Set(Array.from(sources.matchAll(/entry\.(\d+)/g), function (match) { return match[1]; }))], [
    "1405724595"
  ]);
});
