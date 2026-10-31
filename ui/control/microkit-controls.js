/* Vanilla adaptation of MicroKit sliding-content-tabs and scrub-number-field.
 * Copyright (c) 2026 Henrique Barone. MIT license: ../docs/MICROKIT_LICENSE.txt.
 * No React, CDN or MicroKit service is needed at runtime.
 */
(function () {
  'use strict';
  var initialized = false;
  function config(input) {
    return {
      min: Number(input.dataset.min),
      max: Number(input.dataset.max),
      step: Number(input.dataset.step),
    };
  }
  function read(input) {
    var raw = input.value.trim().replace(',', '.');
    return raw === '' ? NaN : Number(raw);
  }
  function step(input, event) {
    return config(input).step * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1);
  }
  function setValue(input, value) {
    var c = config(input),
      next = Math.min(c.max, Math.max(c.min, Math.round(value * 100) / 100));
    input.value = String(next);
    input.dataset.numberSaved = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function commit(input) {
    var value = read(input);
    setValue(input, Number.isFinite(value) ? value : Number(input.dataset.numberSaved));
  }
  function syncNumber(input) {
    var value = read(input),
      c = config(input);
    input.setAttribute('role', 'spinbutton');
    input.setAttribute('aria-valuemin', String(c.min));
    input.setAttribute('aria-valuemax', String(c.max));
    if (Number.isFinite(value)) input.setAttribute('aria-valuenow', String(value));
    else input.removeAttribute('aria-valuenow');
    input.parentElement.querySelectorAll('[data-direction]').forEach(function (button) {
      button.disabled =
        Number.isFinite(value) &&
        (Number(button.dataset.direction) < 0 ? value <= c.min : value >= c.max);
    });
  }
  function setupNumber(input) {
    var surface = input.closest('.number-control'),
      drag = null;
    input.dataset.numberSaved = String(
      Number.isFinite(read(input)) ? read(input) : config(input).min,
    );
    input.addEventListener('focus', function () {
      if (Number.isFinite(read(input))) input.dataset.numberSaved = String(read(input));
    });
    input.addEventListener('input', function () {
      syncNumber(input);
    });
    input.addEventListener('blur', function () {
      commit(input);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        input.value = input.dataset.numberSaved;
        input.blur();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        commit(input);
        input.blur();
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      var value = read(input);
      if (!Number.isFinite(value)) value = Number(input.dataset.numberSaved);
      setValue(input, value + (event.key === 'ArrowUp' ? 1 : -1) * step(input, event));
    });
    surface.querySelectorAll('[data-number-for]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        var value = read(input);
        if (!Number.isFinite(value)) value = Number(input.dataset.numberSaved);
        setValue(input, value + Number(button.dataset.direction) * step(input, event));
      });
    });
    surface.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || event.target.closest('button') || document.activeElement === input)
        return;
      if (event.pointerType === 'mouse') event.preventDefault();
      var value = read(input);
      if (!Number.isFinite(value)) value = Number(input.dataset.numberSaved);
      drag = {
        id: event.pointerId,
        x: event.clientX,
        base: value,
        value: value,
        initial: value,
        step: step(input, event),
        moved: false,
      };
      surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener('pointermove', function (event) {
      if (!drag || drag.id !== event.pointerId) return;
      var held = step(input, event);
      if (held !== drag.step) {
        drag.x = event.clientX;
        drag.base = drag.value;
        drag.step = held;
      }
      var distance = event.clientX - drag.x;
      if (!drag.moved && Math.abs(distance) < 4) return;
      drag.moved = true;
      surface.dataset.scrubbing = 'true';
      setValue(input, drag.base + Math.round(distance / 4) * held);
      drag.value = read(input);
    });
    function finish(event, cancelled) {
      if (!drag || drag.id !== event.pointerId) return;
      var ended = drag;
      drag = null;
      delete surface.dataset.scrubbing;
      if (surface.hasPointerCapture(event.pointerId))
        surface.releasePointerCapture(event.pointerId);
      if (cancelled) {
        if (ended.moved) setValue(input, ended.initial);
        return;
      }
      if (!ended.moved) {
        input.focus();
        input.select();
      }
    }
    surface.addEventListener('pointerup', function (event) {
      finish(event, false);
    });
    surface.addEventListener('pointercancel', function (event) {
      finish(event, true);
    });
    surface.addEventListener('lostpointercapture', function (event) {
      finish(event, true);
    });
  }
  function syncColor(picker) {
    var field = document.getElementById(picker.dataset.colorFor),
      value = field.value.trim();
    picker.classList.toggle('is-empty', value === '');
    if (/^#[0-9a-f]{6}$/i.test(value)) picker.value = value;
    else if (/^#[0-9a-f]{3}$/i.test(value))
      picker.value =
        '#' +
        value
          .slice(1)
          .split('')
          .map(function (char) {
            return char + char;
          })
          .join('');
    picker.title = value || '背景透明；点击选择颜色';
  }
  function syncRange(slider) {
    var min = Number(slider.min || 0),
      max = Number(slider.max || 100),
      value = Number(slider.value);
    var fill = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
    // The fill ends at the centre of the 38px native glass thumb, including
    // the min/max endpoints. Native pointer and keyboard handling are intact.
    slider.style.setProperty('--range-fill', 'calc(' + fill + '% + ' + (19 - 0.38 * fill) + 'px)');
  }
  function updateTabs(instant) {
    if (window.FBPLiquidNav && FBPLiquidNav.update(instant === true)) return;
    var nav = document.querySelector('.panel-nav'),
      active = nav.querySelector('[aria-selected=true]'),
      indicator = nav.querySelector('.tab-indicator');
    if (!indicator || !active) return;
    indicator.style.width = active.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  }
  function preparePickerSpace(select) {
    if (
      !select ||
      !window.CSS ||
      !CSS.supports('appearance', 'base-select') ||
      select.matches(':open')
    )
      return;
    var r = select.getBoundingClientRect();
    // Let the native picker choose above/below, but ensure it fits at least one
    // side on a short viewport. Scrolling and selection stay browser-owned.
    var space = Math.max(r.top - 12, innerHeight - r.bottom - 12);
    select.style.setProperty('--picker-space', Math.max(44, space) + 'px');
  }
  function sync() {
    document.querySelectorAll('[data-scrub-number]').forEach(function (input) {
      if (document.activeElement !== input && Number.isFinite(read(input)))
        input.dataset.numberSaved = String(read(input));
      syncNumber(input);
    });
    document.querySelectorAll('[data-color-for]').forEach(syncColor);
    var slider = document.getElementById('animdur');
    document.querySelectorAll('input[type=range]').forEach(syncRange);
    document.getElementById('animdurVal').textContent = Number(slider.value).toFixed(2) + '×';
    updateTabs();
  }
  function init() {
    if (initialized) return;
    initialized = true;
    document.querySelectorAll('[data-scrub-number]').forEach(setupNumber);
    document.querySelectorAll('input[type=range]').forEach(function (slider) {
      slider.addEventListener('input', function () {
        syncRange(slider);
      });
    });
    document.querySelectorAll('[data-color-for]').forEach(function (picker) {
      var field = document.getElementById(picker.dataset.colorFor);
      picker.addEventListener('input', function () {
        field.value = picker.value.toUpperCase();
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      field.addEventListener('input', function () {
        syncColor(picker);
      });
    });
    document.addEventListener(
      'pointerdown',
      function (event) {
        preparePickerSpace(event.target.closest('select'));
      },
      true,
    );
    document.addEventListener(
      'keydown',
      function (event) {
        preparePickerSpace(event.target.closest('select'));
      },
      true,
    );
    var nav = document.querySelector('.panel-nav');
    if (window.ResizeObserver)
      new ResizeObserver(function () {
        updateTabs(true);
      }).observe(nav);
    else
      window.addEventListener('resize', function () {
        updateTabs(true);
      });
    sync();
  }
  window.FBPWidgets = { init: init, sync: sync, updateTabs: updateTabs };
})();
