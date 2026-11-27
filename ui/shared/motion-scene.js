(function (window) {
  'use strict';

  function keyframe(point) {
    return {
      offset: point.t,
      transform:
        'translate(' +
        point.x +
        'px,' +
        point.y +
        'px) rotate(' +
        point.rotation +
        'deg) scale(' +
        point.sx +
        ',' +
        point.sy +
        ')',
      opacity: point.opacity,
    };
  }

  function nodeFor(element) {
    var node = document.createElement(
      element.type === 'image' ? 'img' : element.type === 'video' ? 'video' : 'div',
    );
    Object.assign(node.style, {
      position: 'absolute',
      left: element.x + 'px',
      top: element.y + 'px',
      width: element.width + 'px',
      height: element.height + 'px',
      opacity: element.opacity ?? 1,
    });
    if (element.type === 'image') {
      node.alt = '';
      if (element.src) node.src = element.src;
      if (element.bind) node.dataset.binding = element.bind;
      node.style.objectFit = element.fit || 'contain';
    } else if (element.type === 'video') {
      node.muted = node.loop = node.playsInline = true;
      node.src = element.src;
      node.style.objectFit = element.fit || 'fill';
    } else if (element.type === 'rect') {
      node.style.background = element.color;
      node.style.borderRadius = element.radius + 'px';
    } else {
      Object.assign(node.style, {
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        whiteSpace: element.wrap ? 'pre-wrap' : 'nowrap',
        justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[element.align],
        fontFamily: JSON.stringify(element.font) + ', "Microsoft YaHei", sans-serif',
        fontSize: element.fontSize + 'px',
        fontWeight: element.weight,
        color: element.color,
        fontVariantNumeric: 'tabular-nums',
      });
      var text = document.createElement('span');
      Object.assign(text.style, {
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        overflowWrap: element.wrap ? 'anywhere' : 'normal',
      });
      setText(text, element, element.text);
      node.append(text);
      if (element.bind) node.dataset.binding = element.bind;
    }
    return node;
  }

  function setText(node, element, value) {
    if (!element.latinFont) {
      node.textContent = value;
      return;
    }
    const fragments = value.split(/([\p{Script=Latin}\p{Mark}0-9\u0020-\u007e]+)/u);
    node.replaceChildren(
      ...fragments.map(function (text, index) {
        if (index % 2 === 0) return text;
        const span = document.createElement('span');
        span.style.fontFamily =
          JSON.stringify(element.latinFont) + ', ' + JSON.stringify(element.font);
        span.textContent = text;
        return span;
      }),
    );
  }

  function stageScene(design, elements = design.elements) {
    return {
      id: design.id,
      width: design.scene.width,
      height: design.scene.height,
      elements,
      enter: design.motion.enter,
      exit: design.motion.exit,
    };
  }

  function ink(hex) {
    var rgb = hex
      .slice(1)
      .match(/../g)
      .map(function (value) {
        var component = parseInt(value, 16) / 255;
        return component <= 0.04045
          ? component / 12.92
          : Math.pow((component + 0.055) / 1.055, 2.4);
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.4 ? '#102f2c' : '#fff';
  }

  function attach(host, { staticArtwork = false } = {}) {
    var template,
      key,
      root,
      bindings,
      running,
      visible,
      values = {};
    function clear() {
      if (running) running.cancel();
      if (root) root.remove();
      key = template = root = running = null;
      host.classList.remove('motion-host');
      visible = false;
    }
    function fit(binding) {
      var text = binding.node.firstElementChild;
      text.style.fontSize = '';
      var width = text.scrollWidth;
      if (width > binding.node.clientWidth) {
        var factor = binding.node.clientWidth / width;
        text.style.fontSize =
          Math.max(binding.element.minFontSize, Math.floor(binding.element.fontSize * factor)) +
          'px';
      }
    }
    function update(fields) {
      Object.assign(values, fields);
      if (!root) return;
      bindings.forEach(function (binding) {
        var element = binding.element,
          node = binding.node;
        if (element.type === 'image' && element.bind) {
          var image = values[element.bind] || '';
          var allowed =
            /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(image) ||
            /^\/assets\/[a-z0-9_.%~-]+$/i.test(image);
          var source = allowed ? image : element.src;
          if (source && node.getAttribute('src') !== source) node.src = source;
          else if (!source) node.removeAttribute('src');
        } else if (element.bind) {
          var next = String(values[element.bind] ?? element.text);
          if (node.firstElementChild.textContent !== next) {
            setText(node.firstElementChild, element, next);
            fit(binding);
          }
        }
        if (element.inkField) {
          var background = values['color.' + element.inkField];
          node.style.color = /^#[0-9a-f]{6}$/i.test(background) ? ink(background) : element.color;
        } else if (element.colorField) {
          var shade = values['color.' + element.colorField];
          node.style.backgroundColor = /^#[0-9a-f]{6}$/i.test(shade) ? shade : element.color;
        }
      });
    }
    function load(next, revision) {
      if (!next) {
        if (root) clear();
        return;
      }
      var signature = next.id + ':' + revision;
      if (key === signature) return;
      clear();
      template = next;
      key = signature;
      root = document.createElement('div');
      root.className = 'motion-scene';
      Object.assign(root.style, {
        position: 'relative',
        width: next.width + 'px',
        height: next.height + 'px',
        transformOrigin: '0 0',
        flex: 'none',
      });
      root.style.visibility = 'hidden';
      bindings = next.elements.map(function (element) {
        var node = nodeFor(element);
        root.append(node);
        return { element: element, node: node };
      });
      host.classList.add('motion-host');
      host.append(root);
      update({});
    }
    function setVisible(show, animate) {
      if (!root || visible === show) return;
      var previous = running ? getComputedStyle(root) : null;
      var interrupted = previous && {
        transform: previous.transform,
        opacity: previous.opacity,
        offset: 0,
      };
      if (running) running.cancel();
      visible = show;
      var video = Array.from(root.querySelectorAll('video'));
      if (show) {
        root.style.visibility = 'visible';
        video.forEach(function (item) {
          item.play().catch(function () {});
        });
      }
      var track = show ? template.enter : template.exit;
      var final = staticArtwork
        ? { transform: 'none', opacity: 1 }
        : keyframe(track.frames[track.frames.length - 1]);
      function finish() {
        root.style.transform = final.transform;
        root.style.opacity = final.opacity;
        root.style.visibility = show ? 'visible' : 'hidden';
        if (!show)
          video.forEach(function (item) {
            item.pause();
          });
      }
      if (
        staticArtwork ||
        animate === false ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        finish();
        running = null;
        return;
      }
      var frames = track.frames.map(keyframe);
      if (interrupted) frames[0] = interrupted;
      var animation = root.animate(frames, { duration: track.duration, fill: 'forwards' });
      running = animation;
      animation.finished
        .then(function () {
          if (running !== animation) return;
          finish();
          animation.cancel();
          running = null;
        })
        .catch(function () {});
    }
    return { load: load, update: update, setVisible: setVisible };
  }
  window.FBPMotionScene = { attach: attach, stageScene: stageScene, keyframe: keyframe };
})(window);
