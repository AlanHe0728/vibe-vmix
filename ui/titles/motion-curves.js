// Apple-style smooth settling, expressed as native CSS/WAAPI easing.
// Critically damped unit step: x(t)=1-(1+omega*t)*exp(-omega*t).
// The response is 2/3 of the configured playback window; time scaling preserves
// the shape for custom durations. Normalize the finite tail to finish exactly
// at 1, without overshoot or a final snap. No per-frame JS or runtime library.
(function (global) {
  var omega = (2 * Math.PI) / (2 / 3),
    end = 1 - (1 + omega) * Math.exp(-omega),
    points = [];
  for (var i = 0; i <= 120; i++) {
    var t = i / 120,
      value = (1 - (1 + omega * t) * Math.exp(-omega * t)) / end;
    points.push(i === 0 ? '0' : i === 120 ? '1' : value.toFixed(7));
  }
  var spring = 'linear(' + points.join(',') + ')',
    fallback = 'cubic-bezier(.77,0,.175,1)';
  // linear() is a piecewise approximation of a spring, not constant-speed linear.
  // Older vMix browser engines use the nonlinear cubic-bezier fallback.
  var supported = typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', spring);
  global.FBPMotion = { smooth: supported ? spring : fallback };
})(window);
