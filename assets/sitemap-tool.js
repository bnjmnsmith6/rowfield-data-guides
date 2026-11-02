(function () {
  'use strict';
  var S = window.RowfieldSitemap;
  var input = document.getElementById('xml');
  var file = document.getElementById('file');
  var status = document.getElementById('status');
  var tbody = document.getElementById('rows');
  var thead = document.getElementById('head');
  var dl = document.getElementById('download');
  var copy = document.getElementById('copy');
  var last = null;
  var SHOW = 500;
  var MSG = {
    'empty': 'Paste a sitemap first.',
    'not-a-sitemap': 'This does not look like a sitemap (no <urlset> or <sitemapindex> found).',
    'no-urls': 'No URLs found. A plain-text sitemap needs one http(s) URL per line.'
  };

  function cell(tr, text, tag) {
    var td = document.createElement(tag || 'td');
    td.textContent = text;
    tr.appendChild(td);
  }

  function render(r) {
    last = r;
    tbody.textContent = '';
    thead.textContent = '';
    dl.disabled = copy.disabled = !(r.entries && r.entries.length);
    if (r.error) { status.textContent = MSG[r.error] || r.error; return; }
    var cols = r.type === 'sitemapindex' ? ['loc', 'lastmod'] : ['loc', 'lastmod', 'changefreq', 'priority'];
    var hr = document.createElement('tr');
    cols.forEach(function (c) { cell(hr, c, 'th'); });
    thead.appendChild(hr);
    r.entries.slice(0, SHOW).forEach(function (e) {
      var tr = document.createElement('tr');
      cols.forEach(function (c) { cell(tr, e[c] || ''); });
      tbody.appendChild(tr);
    });
    var kind = r.type === 'sitemapindex' ? 'child sitemaps (this is a sitemap index)' : 'URLs';
    var msg = r.entries.length + ' ' + kind + ' found';
    if (r.duplicates) msg += ', ' + r.duplicates + ' duplicates removed';
    if (r.entries.length > SHOW) msg += '. Showing the first ' + SHOW + '; the CSV has all of them';
    if (r.type === 'sitemapindex') msg += '. Open each child sitemap and paste it here, or use the Apify actor to follow the index for you';
    status.textContent = msg + '.';
  }

  document.getElementById('parse').addEventListener('click', function () { render(S.parseSitemap(input.value)); });

  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    if (!f) return;
    if (/\.gz$/i.test(f.name)) { status.textContent = 'This page cannot read .gz files. Unzip it first, or use the Apify actor (it reads .gz).'; return; }
    var reader = new FileReader();
    reader.onload = function () { input.value = reader.result; render(S.parseSitemap(reader.result)); };
    reader.readAsText(f);
  });

  dl.addEventListener('click', function () {
    if (!last) return;
    var blob = new Blob([S.toCSV(last)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = last.type === 'sitemapindex' ? 'sitemap-index.csv' : 'sitemap-urls.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  copy.addEventListener('click', function () {
    if (!last) return;
    var text = last.entries.map(function (e) { return e.loc; }).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { status.textContent = 'Copied ' + last.entries.length + ' URLs.'; });
  });
})();
