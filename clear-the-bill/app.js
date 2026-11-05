/* Updates the sample total and the research-form links.
   Does not store email, write browser storage, or send the form. */
(function () {
  var logic = window.ClearTheBill;
  var config = window.CLEAR_THE_BILL_CONFIG || { responderUrl: "", samplePrefillUrl: "" };
  var form = document.getElementById("sample-form");
  var banner = document.getElementById("launch-banner");
  var status = document.getElementById("form-status");
  var total = document.getElementById("sample-total");
  var summary = document.getElementById("selection-summary");
  var review = document.getElementById("review-link");
  var join = document.getElementById("join-link");
  var reset = document.getElementById("reset-selection");

  function selectedIds() {
    return Array.prototype.map.call(
      form.querySelectorAll('input[name="sample"]:checked'),
      function (input) { return input.value; }
    );
  }

  function setText(el, value) {
    if (el.textContent !== value) el.textContent = value;
  }

  function setLink(el, spec) {
    var detail = el.querySelector(".button-state");
    if (detail && detail.textContent !== spec.detail) detail.textContent = spec.detail;
    if (spec.href && logic.isNavigableFormUrl(spec.href)) {
      el.setAttribute("href", spec.href);
      el.removeAttribute("aria-disabled");
      el.removeAttribute("tabindex");
      return;
    }
    el.removeAttribute("href");
    el.setAttribute("aria-disabled", "true");
    el.setAttribute("tabindex", "-1");
  }

  function render() {
    var state = logic.linkState(config, selectedIds());
    document.documentElement.setAttribute("data-form-state", state.configured ? "configured" : "unconfigured");
    document.documentElement.setAttribute("data-config-reason", state.reason);
    setText(banner, state.banner);
    setText(status, state.status);
    setText(total, state.total);
    setText(summary, state.summary);
    setLink(review, state.review);
    setLink(join, state.join);
  }

  function blockDisabled(event) {
    var link = event.currentTarget;
    if (link.getAttribute("aria-disabled") === "true" || !link.getAttribute("href")) {
      event.preventDefault();
    }
  }

  form.addEventListener("submit", function (event) { event.preventDefault(); });
  form.addEventListener("change", render);
  reset.addEventListener("click", function () {
    var boxes = form.querySelectorAll('input[name="sample"]');
    Array.prototype.forEach.call(boxes, function (box) { box.checked = false; });
    render();
  });
  review.addEventListener("click", blockDisabled);
  join.addEventListener("click", blockDisabled);
  render();
})();
