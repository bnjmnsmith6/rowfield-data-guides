/* Sitemap parser for the paste-in tool. Runs fully in the browser (or Node for tests).
   No network access: it only reads the text you give it. */
(function (root) {
  'use strict';

  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, function (m, e) {
      if (e === 'amp') return '&';
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'quot') return '"';
      if (e === 'apos') return "'";
      var code = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (err) { return m; }
    });
  }

  // Text content of a child element (CDATA placeholders restored, entities decoded).
  function childText(block, name, prefix, cdata) {
    var p = prefix ? prefix + ':' : '';
    var re = new RegExp('<' + p + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + p + name + '\\s*>', 'i');
    var m = block.match(re);
    if (!m) return '';
    var parts = m[1].split(/\u0000(\d+)\u0000/);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) out += cdata[+parts[i]];
      else out += decodeEntities(parts[i].replace(/<[^>]*>/g, ''));
    }
    return out.trim();
  }

  function parseSitemap(text) {
    var result = { type: 'unknown', entries: [], duplicates: 0, error: null };
    if (typeof text !== 'string' || !text.trim()) {
      result.error = 'empty';
      return result;
    }
    var cdata = [];
    var src = text.replace(/^\uFEFF/, '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, function (m, c) { cdata.push(c); return '\u0000' + (cdata.length - 1) + '\u0000'; })
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\?[\s\S]*?\?>/g, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '');

    var rootM = src.match(/<(?:([\w.-]+):)?(urlset|sitemapindex)\b[^>]*>/i);
    var seen = Object.create(null);
    function add(entry) {
      if (!entry.loc) return;
      if (seen[entry.loc]) { result.duplicates++; return; }
      seen[entry.loc] = true;
      result.entries.push(entry);
    }

    if (rootM) {
      var prefix = rootM[1] || '';
      result.type = rootM[2].toLowerCase();
      var child = result.type === 'urlset' ? 'url' : 'sitemap';
      var p = prefix ? prefix + ':' : '';
      var blockRe = new RegExp('<' + p + child + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + p + child + '\\s*>', 'gi');
      var m;
      while ((m = blockRe.exec(src)) !== null) {
        // Drop extension elements (image:, video:, news:, xhtml: ...) so their <x:loc> is never used.
        var block = m[1].replace(/<([\w.-]+):([\w.-]+)\b[^>]*\/>/g, function (all, pf) { return pf === prefix ? all : ''; });
        var prev;
        do {
          prev = block;
          block = block.replace(/<([\w.-]+):([\w.-]+)\b[^>]*>[\s\S]*?<\/\1:\2\s*>/g, function (all, pf) { return pf === prefix ? all : ''; });
        } while (block !== prev);
        var e = { loc: childText(block, 'loc', prefix, cdata), lastmod: childText(block, 'lastmod', prefix, cdata) };
        if (result.type === 'urlset') {
          e.changefreq = childText(block, 'changefreq', prefix, cdata);
          e.priority = childText(block, 'priority', prefix, cdata);
        }
        add(e);
      }
      return result;
    }

    // Plain-text sitemap: one URL per line.
    if (!/<[a-zA-Z]/.test(src)) {
      result.type = 'text';
      src.split(/\r?\n/).forEach(function (line) {
        var u = line.trim();
        if (/^https?:\/\/\S+$/i.test(u)) add({ loc: u, lastmod: '', changefreq: '', priority: '' });
      });
      if (!result.entries.length) result.error = 'no-urls';
      return result;
    }

    result.error = 'not-a-sitemap';
    return result;
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from running formulas
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(result) {
    var cols = result.type === 'sitemapindex' ? ['loc', 'lastmod'] : ['loc', 'lastmod', 'changefreq', 'priority'];
    var lines = [cols.join(',')];
    result.entries.forEach(function (e) {
      lines.push(cols.map(function (c) { return csvCell(e[c]); }).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  var api = { parseSitemap: parseSitemap, toCSV: toCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RowfieldSitemap = api;
})(this);
