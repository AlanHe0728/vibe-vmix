'use strict';

const StageMedia = (() => {
  const isSequence = (file) => /\.(?:frames\.json|alpha\.mp4|mov)$/i.test(file);
  const isMotion = (file) => isSequence(file) || /\.(?:webm|mp4)$/i.test(file);
  const manifests = new Map();

  function manifest(src, optimized) {
    src += optimized ? '/playback.json' : '/sequence.json';
    if (!manifests.has(src)) {
      const ready = fetch(src)
        .then(async (response) => {
          if (!response.ok) throw Error((await response.json()).error || '无法加载媒体帧');
          return response.json();
        })
        .catch((error) => {
          manifests.delete(src);
          throw error;
        });
      manifests.set(src, ready);
    }
    return manifests.get(src);
  }

  function loadImage(url) {
    const image = new Image();
    image.alt = '';
    return new Promise((resolve, reject) => {
      image.onload = () => {
        image.onload = image.onerror = null;
        resolve(image);
      };
      image.onerror = () => {
        image.onload = image.onerror = null;
        reject(Error('无法读取画面'));
      };
      image.src = url;
    });
  }

  function mount(host, { fit } = {}) {
    let key = '',
      generation = 0,
      timer,
      video,
      observer,
      dimensions,
      onSize;
    function stop() {
      generation++;
      key = '';
      dimensions = undefined;
      clearTimeout(timer);
      observer?.disconnect();
      observer = undefined;
      delete host.dataset.mediaError;
      if (video) {
        video.onloadedmetadata = video.onended = video.onerror = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      video = undefined;
      host.replaceChildren();
    }

    async function playFrames(src, options, isCurrent, fail, finish) {
      const { fps, frames, width, height, crops } = await manifest(src, Boolean(fit));
      if (!isCurrent()) return;
      reportSize(width, height);
      const frameMs = 1000 / fps;
      const { loop, resume, at, maxMs } = options;
      const duration = Math.min(frames * frameMs, maxMs || Infinity);
      const offset = resume ? Math.max(0, Date.now() - at) : 0;
      if (!loop && offset >= duration) {
        finish();
        return;
      }
      const cropped = Array.isArray(crops) && crops.length === frames;
      const surface = cropped ? document.createElement('div') : host;
      if (cropped) {
        surface.style.position = 'absolute';
        surface.style.inset = '0';
        if (fit === 'contain') {
          const resize = () => {
            const scale = Math.min(host.clientWidth / width, host.clientHeight / height);
            surface.style.width = width * scale + 'px';
            surface.style.height = height * scale + 'px';
            surface.style.margin = 'auto';
          };
          observer = new ResizeObserver(resize);
          observer.observe(host);
          resize();
        }
        host.replaceChildren(surface);
      }
      function place(image, [x, y, w, h]) {
        Object.assign(image.style, {
          position: 'absolute',
          left: (100 * x) / width + '%',
          top: (100 * y) / height + '%',
          width: (100 * w) / width + '%',
          height: (100 * h) / height + '%',
        });
        return image;
      }
      const cache = new Map();
      const wanted = (index) => {
        const frame = loop ? index % frames : index;
        if (frame >= frames) return null;
        if (!cache.has(frame)) {
          const region = cropped ? crops[frame] : false;
          const pending = { image: null, ready: region === null };
          const file = src + '/' + String(frame).padStart(7, '0') + '.png';
          const original = () =>
            loadImage(file).then((image) =>
              cropped ? place(image, [0, 0, width, height]) : image,
            );
          pending.promise = (
            region === null
              ? Promise.resolve(null)
              : region
                ? loadImage(src + '/crop-' + String(frame).padStart(7, '0') + '.png')
                    .then((image) => place(image, region))
                    .catch(original)
                : original()
          )
            .then((image) => {
              pending.image = image;
              pending.ready = true;
            })
            .catch(() => {
              if (cache.get(frame) === pending) cache.delete(frame);
              return null;
            });
          cache.set(frame, pending);
        }
        return cache.get(frame);
      };
      let shown = Math.floor(offset / frameMs);
      const row = wanted(shown);
      for (let lead = 1; lead <= 5; lead++) wanted(shown + lead);
      await row.promise;
      if (!isCurrent()) return;
      if (!row.ready) {
        fail(Error('无法读取第一帧'));
        return;
      }
      function show(row) {
        if (row.image) surface.replaceChildren(row.image);
        else if (surface.firstChild) surface.replaceChildren();
      }
      show(row);
      if (loop && frames === 1) return;
      const starting = performance.now() - offset;
      function tick() {
        if (!isCurrent()) return;
        const elapsed = performance.now() - starting;
        if (!loop && elapsed >= duration) {
          finish();
          return;
        }
        const target = Math.max(0, Math.floor(elapsed / frameMs));
        const keep = new Set();
        for (let index = Math.max(0, target - 2); index <= target + 5; index++) {
          const row = wanted(index);
          if (!row) continue;
          keep.add(loop ? index % frames : index);
        }
        for (const index of cache.keys()) if (!keep.has(index)) cache.delete(index);
        for (let index = target; index > Math.max(shown, target - 3); index--) {
          const row = wanted(index);
          if (row?.ready) {
            show(row);
            shown = index;
            break;
          }
        }
        timer = setTimeout(tick, Math.max(4, (target + 1) * frameMs - elapsed));
      }
      timer = setTimeout(tick, Math.min(frameMs, duration));
    }

    function reportSize(width, height) {
      if (width > 0 && height > 0) {
        dimensions = { width, height };
        onSize?.(dimensions);
      }
    }

    function set(
      file,
      {
        loop = true,
        cue = '',
        at = 0,
        resume = false,
        maxMs = 0,
        end = () => {},
        error = end,
        onDimensions,
      } = {},
    ) {
      const signature = file && [file, loop, cue].join('|');
      onSize = onDimensions;
      if (signature === key) return;
      stop();
      if (!file) return;
      key = signature;
      const current = generation;
      const isCurrent = () => current === generation;
      const finish = () => {
        if (isCurrent()) {
          stop();
          end();
        }
      };
      const fail = (reason) => {
        if (!isCurrent()) return;
        stop();
        key = signature;
        const message = reason?.message || '此网页无法播放素材';
        host.dataset.mediaError = message;
        error(message);
      };
      const src = '/assets/' + encodeURIComponent(file);
      if (isSequence(file)) {
        void playFrames(src, { loop, resume, at, maxMs }, isCurrent, fail, finish).catch(fail);
        return;
      }
      if (/\.(?:png|jpe?g|webp)$/i.test(file)) {
        void loadImage(src)
          .then((image) => {
            if (isCurrent()) {
              reportSize(image.naturalWidth, image.naturalHeight);
              host.append(image);
            }
          })
          .catch(fail);
        return;
      }
      const element = (video = document.createElement('video'));
      element.muted = true;
      element.playsInline = true;
      element.loop = loop;
      element.onerror = fail;
      element.onended = finish;
      element.onloadedmetadata = () => {
        reportSize(element.videoWidth, element.videoHeight);
        if (resume && Number.isFinite(element.duration)) {
          const elapsed = Math.max(0, (Date.now() - at) / 1000);
          if (elapsed >= Math.min(element.duration, maxMs ? maxMs / 1000 : Infinity)) {
            finish();
            return;
          }
          element.currentTime = elapsed;
        }
        element
          .play()
          .then(() => {
            if (isCurrent() && maxMs)
              timer = setTimeout(finish, Math.max(0, maxMs - element.currentTime * 1000));
          })
          .catch(fail);
      };
      host.append(element);
      element.src = src;
    }
    return { set, stop, size: () => dimensions };
  }
  return { mount, isSequence, isMotion };
})();
