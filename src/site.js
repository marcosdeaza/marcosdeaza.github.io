// Aguja del reloj con la hora de Valencia y tiempos relativos ("hace 3 horas").
(() => {
  const TZ = 'Europe/Madrid';
  const C = 200;
  const lang = document.documentElement.lang;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const needle = document.getElementById('needle');
  const readout = document.getElementById('readout');
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  // Misma escala que el SVG: 270° desde las 06:00.
  const angleAt = (t) => -135 + ((((t - 6) % 24) + 24) % 24) / 24 * 270;
  const now = () => {
    const text = clock.format(new Date());
    const [h, m] = text.split(':').map(Number);
    return { text, t: h + m / 60 };
  };
  const point = (deg) => needle.setAttribute('transform', `rotate(${deg.toFixed(2)} ${C} ${C})`);

  const sweep = (from, to, ms) => new Promise((done) => {
    const start = performance.now();
    const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const frame = (time) => {
      const k = Math.min(1, (time - start) / ms);
      point(from + (to - from) * ease(k));
      if (k < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });

  const update = () => {
    const { text, t } = now();
    point(angleAt(t));
    readout.textContent = text;
  };

  // Al arrancar, la aguja recorre la escala entera y vuelve a la hora actual,
  // como el cuadro de un coche al dar el contacto.
  if (needle && readout) {
    readout.textContent = now().text;
    const begin = async () => {
      if (!reduce) {
        await sweep(-135, 135, 950);
        await sweep(135, angleAt(now().t), 1100);
      }
      update();
      setInterval(update, 20000);
    };
    (document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(begin, 250));
  }

  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const units = [['year', 31536e6], ['month', 2592e6], ['week', 6048e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4]];
  for (const el of document.querySelectorAll('time[data-ago]')) {
    const diff = new Date(el.dateTime) - Date.now();
    const [unit, ms] = units.find(([, size]) => Math.abs(diff) >= size) ?? units.at(-1);
    el.textContent = rtf.format(Math.round(diff / ms), unit);
  }
})();
