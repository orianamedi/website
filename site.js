/* Oriana Medi – site script: language, navigation, forms, bid-fee calculator */
(function () {
  'use strict';

  /* Where contact forms are delivered. FormSubmit forwards each submission to this
     address by email. The first submission triggers a one-time activation email
     to info@orianamedi.com – click the link in it, and all later forms arrive. */
  var FORM_ENDPOINT = 'https://formsubmit.co/ajax/info@orianamedi.com';
  var FALLBACK_EMAIL = 'info@orianamedi.com';

  var d = document.documentElement;
  var lang = function () { return d.lang === 'en' ? 'en' : 'sl'; };

  /* ---------- language ---------- */
  var langBtns = document.querySelectorAll('.lang button');
  function setLang(l) {
    d.lang = l;
    var t = d.getAttribute('data-title-' + l);
    if (t) document.title = t;
    langBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-set') === l ? 'true' : 'false');
    });
    document.querySelectorAll('[data-sl][data-en]').forEach(function (el) {
      var v = el.getAttribute('data-' + l);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = v;
      else el.textContent = v;
    });
    try { localStorage.setItem('om-lang', l); } catch (e) {}
    if (typeof updateCalc === 'function') updateCalc();
  }
  langBtns.forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-set')); });
  });

  /* ---------- header: solid on scroll, mobile menu ---------- */
  var header = document.querySelector('header.nav');
  function onScroll() {
    if (!header || document.body.classList.contains('plainnav')) return;
    header.classList.toggle('solid', window.scrollY > 60);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  var menuBtn = document.querySelector('.menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = header.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) header.classList.add('solid');
    });
    header.querySelectorAll('nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        header.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- links that preset the form topic ---------- */
  function presetTopic(topic) {
    var sel = document.querySelector('form.js-form select[name="topic"]');
    if (sel && topic) sel.value = topic;
  }
  document.querySelectorAll('[data-topic]').forEach(function (a) {
    a.addEventListener('click', function () { presetTopic(a.getAttribute('data-topic')); });
  });
  var q = new URLSearchParams(location.search).get('topic');
  if (q) presetTopic(q);

  /* ---------- forms ---------- */
  document.querySelectorAll('form.js-form').forEach(function (form) {
    var err = form.querySelector('.err');
    var ok = form.parentNode.querySelector('.ok');
    var btn = form.querySelector('button[type="submit"]');

    function showErr(key) {
      err.querySelectorAll('[data-err]').forEach(function (s) {
        s.hidden = s.getAttribute('data-err') !== key;
      });
      err.hidden = false;
    }

    function mailtoFallback(data) {
      var body = Object.keys(data).filter(function (k) { return k.charAt(0) !== '_'; })
        .map(function (k) { return k + ': ' + data[k]; }).join('\n');
      return 'mailto:' + FALLBACK_EMAIL + '?subject=' + encodeURIComponent(data._subject) +
        '&body=' + encodeURIComponent(body);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      if (form.querySelector('[name="_honey"]').value) return; // bot
      var f = form.elements;
      var email = (f.email.value || '').trim();
      if (!f.name.value.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
          (f.message && f.message.required && !f.message.value.trim())) {
        showErr('fields'); return;
      }
      if (!f.consent.checked) { showErr('consent'); return; }

      var sel = f.topic;
      var topicLabel = sel ? sel.options[sel.selectedIndex].textContent : '';
      var data = {
        _subject: 'Spletna stran – ' + topicLabel,
        _template: 'table',
        _captcha: 'false',
        Tema_Topic: topicLabel,
        Ime_Name: f.name.value.trim(),
        Organizacija_Organisation: f.org ? f.org.value.trim() : '',
        Email: email,
        Telefon_Phone: f.phone ? f.phone.value.trim() : '',
        Drzava_Country: f.country ? f.country.value.trim() : '',
        Sporocilo_Message: f.message ? f.message.value.trim() : '',
        Jezik_Language: lang(),
        Stran_Page: location.pathname
      };
      data._replyto = email;

      btn.disabled = true;
      var label = btn.innerHTML;
      btn.textContent = lang() === 'sl' ? 'Pošiljam …' : 'Sending …';

      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || String(res.j.success) !== 'true') throw new Error('send');
          form.hidden = true;
          ok.hidden = false;
          ok.querySelectorAll('.js-echo-email').forEach(function (s) { s.textContent = email; });
          ok.setAttribute('tabindex', '-1');
          ok.focus();
        })
        .catch(function () {
          var a = err.querySelector('a.js-mailto');
          if (a) a.href = mailtoFallback(data);
          showErr('send');
        })
        .then(function () { btn.disabled = false; btn.innerHTML = label; });
    });

    var again = ok && ok.querySelector('.js-again');
    if (again) again.addEventListener('click', function () {
      form.reset(); form.hidden = false; ok.hidden = true;
    });
  });

  /* ---------- bid-fee calculator (Tender Watch page) ---------- */
  var calc = document.querySelector('.js-calc');
  var state = { plan: 0, type: 0, lots: 1 };
  var FEES = [{ base: 1500, extra: 250, rebid: 950 }, { base: 1800, extra: 330, rebid: 1200 }];
  function eur(n) { return '€' + n.toLocaleString(lang() === 'sl' ? 'de-DE' : 'en-GB'); }
  function updateCalc() {
    if (!calc) return;
    var P = FEES[state.plan], sl = lang() === 'sl', total, br;
    if (state.type === 0) {
      total = P.base + (state.lots - 1) * P.extra;
      br = eur(P.base) + (sl ? ' prvi sklop' : ' first lot') +
        (state.lots > 1 ? ' + ' + (state.lots - 1) + ' × ' + eur(P.extra) + (sl ? ' dodatni sklopi' : ' additional lots') : '');
    } else {
      total = P.rebid;
      br = eur(P.rebid) + (sl ? ' ponovna ponudba, dokumenti se ponovno uporabijo' : ' re-bid, documents reused');
    }
    calc.querySelector('.js-sum').textContent = (sl ? 'od ' : 'from ') + eur(total);
    calc.querySelector('.js-br').textContent = br;
    calc.querySelector('output').textContent = state.lots;
    calc.querySelector('.js-lots').style.opacity = state.type === 0 ? '1' : '.45';
    calc.querySelectorAll('[data-k]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(state[b.getAttribute('data-k')]) === b.getAttribute('data-v') ? 'true' : 'false');
    });
  }
  window.updateCalc = updateCalc;
  if (calc) {
    calc.querySelectorAll('[data-k]').forEach(function (b) {
      b.addEventListener('click', function () { state[b.getAttribute('data-k')] = +b.getAttribute('data-v'); updateCalc(); });
    });
    calc.querySelector('.js-minus').addEventListener('click', function () { state.lots = Math.max(1, state.lots - 1); updateCalc(); });
    calc.querySelector('.js-plus').addEventListener('click', function () { state.lots = Math.min(20, state.lots + 1); updateCalc(); });
  }

  setLang(lang());
})();
