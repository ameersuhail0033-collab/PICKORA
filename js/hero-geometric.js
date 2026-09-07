/**
 * hero-geometric.js — WebGL geometric/organic shader background
 * for the Pickora homepage hero section.
 *
 * Features:
 * - Simplex noise animated organic distortion
 * - Diagonal gradient with stepped color bands
 * - Subtle Bayer dithering to reduce banding
 * - Vignette + corner fade
 * - DPR capped at 1.5
 * - Pauses when hidden
 * - CSS gradient fallback on WebGL failure
 * - Respects prefers-reduced-motion
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function getColors() {
    var s = getComputedStyle(document.documentElement);
    return {
      deep: hexToRGB(s.getPropertyValue('--pk-navy').trim() || '#061A3D'),
      violet: hexToRGB(s.getPropertyValue('--pk-violet').trim() || '#8B5CF6'),
      lavender: hexToRGB(s.getPropertyValue('--pk-lavender').trim() || '#C4A3FF'),
      pale: hexToRGB('#F4F1FF'),
    };
  }

  function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return [
      parseInt(hex.substring(0, 2), 16) / 255,
      parseInt(hex.substring(2, 4), 16) / 255,
      parseInt(hex.substring(4, 6), 16) / 255,
    ];
  }

  // ── Simplex 3D Noise (JS implementation for the CPU fallback + used in shader below) ──
  var NOISE_SHADER = [
    'float mod289(float x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',

    'float snoise(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0);',
    '  const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy));',
    '  vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz);',
    '  vec3 l=1.0-g;',
    '  vec3 i1=min(g.xyz,l.zxy);',
    '  vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx;',
    '  vec3 x2=x0-i2+C.yyy;',
    '  vec3 x3=x0-D.yyy;',
    '  i=mod289(i);',
    '  vec4 p=permute(permute(permute(',
    '    i.z+vec4(0.0,i1.z,i2.z,1.0))',
    '    +i.y+vec4(0.0,i1.y,i2.y,1.0))',
    '    +i.x+vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_=0.142857142857;',
    '  vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z);',
    '  vec4 y_=floor(j-7.0*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy;',
    '  vec4 y=y_*ns.x+ns.yyyy;',
    '  vec4 h=1.0-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy);',
    '  vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0;',
    '  vec4 s1=floor(b1)*2.0+1.0;',
    '  vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;',
    '  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x);',
    '  vec3 p1=vec3(a0.zw,h.y);',
    '  vec3 p2=vec3(a1.xy,h.z);',
    '  vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    '  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);',
    '  m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}',
  ].join('\n');

  // ── Vertex Shader ──
  var VERT_SRC = 'attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}';

  // ── Fragment Shader ──
  var FRAG_SRC = 'precision mediump float;\n' + NOISE_SHADER + '\n' + [
    '// precision already declared',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform vec3 u_deep;',
    'uniform vec3 u_violet;',
    'uniform vec3 u_lavender;',
    'uniform vec3 u_pale;',

    'float bayer4(vec2 p){',
    '  float b=fract(dot(floor(p*0.5),vec2(0.5,0.25))+floor(p.y*0.5)*0.5);',
    '  return b*0.03-0.015;',
    '}',

    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;',
    '  float aspect=u_res.x/u_res.y;',
    '  vec2 auv=vec2(uv.x*aspect,uv.y);',
    '  float t=u_time*0.01;',
    '  float freq=1.5;',

    // Simplex noise distortion
    '  float nx=snoise(vec3(auv.x*freq+t*0.5,auv.y*freq,t*0.3));',
    '  float ny=snoise(vec3(auv.x*freq+50.0,auv.y*freq+t*0.3,t*0.5));',
    '  vec2 distorted=uv+vec2(nx,ny)*0.025;',

    // Diagonal gradient
    '  float grad=(distorted.x+distorted.y)*0.5;',
    '  grad=clamp(grad,0.0,1.0);',

    // Color bands
    '  vec3 col;',
    '  if(grad<0.30){col=mix(u_deep,u_violet,grad/0.30);}',
    '  else if(grad<0.55){col=mix(u_violet,u_lavender,(grad-0.30)/0.25);}',
    '  else if(grad<0.80){col=mix(u_lavender,u_pale,(grad-0.55)/0.25);}',
    '  else{col=u_pale;}',

    // Dithering
    '  col+=bayer4(gl_FragCoord.xy);',

    // Vignette
    '  float vig=length(uv-0.5)*1.2;',
    '  col*=1.0-vig*0.15;',

    // Pale corner fade
    '  float corner=smoothstep(0.3,1.0,length(uv-vec2(1.0,1.0)));',
    '  col=mix(col,u_pale*0.95,corner*0.4);',

    '  gl_FragColor=vec4(col,1.0);',
    '}',
  ].join('\n');

  // ── Init ──
  function init() {
    var hero = document.querySelector('.pk-hero');
    if (!hero) return;

    var canvas = document.createElement('canvas');
    canvas.id = 'pk-hero-webgl';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    hero.style.position = 'relative';
    hero.insertBefore(canvas, hero.firstChild);

    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false });
    if (!gl) { applyFallback(hero); return; }

    var vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) { applyFallback(hero); return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[hero-geometric] Link failed');
      applyFallback(hero);
      return;
    }
    gl.useProgram(prog);

    // Full-screen quad
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, 'u_res');
    var uTime = gl.getUniformLocation(prog, 'u_time');
    var uDeep = gl.getUniformLocation(prog, 'u_deep');
    var uViolet = gl.getUniformLocation(prog, 'u_violet');
    var uLavender = gl.getUniformLocation(prog, 'u_lavender');
    var uPale = gl.getUniformLocation(prog, 'u_pale');

    var startTime = Date.now();
    var animFrame = null;
    var visible = true;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = hero.offsetWidth;
      var h = hero.offsetHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
    }

    function render() {
      if (!visible || prefersReducedMotion) return;
      resize();
      var colors = getColors();
      var t = (Date.now() - startTime) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform3fv(uDeep, colors.deep);
      gl.uniform3fv(uViolet, colors.violet);
      gl.uniform3fv(uLavender, colors.lavender);
      gl.uniform3fv(uPale, colors.pale);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animFrame = requestAnimationFrame(render);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        visible = false;
        if (animFrame) cancelAnimationFrame(animFrame);
      } else {
        visible = true;
        render();
      }
    });

    // Pause when hero is off-screen
    var heroObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !document.hidden && !prefersReducedMotion) {
          visible = true;
          render();
        } else {
          visible = false;
          if (animFrame) cancelAnimationFrame(animFrame);
        }
      });
    }, { threshold: 0.05 });
    heroObserver.observe(hero);

    if (prefersReducedMotion) {
      resize();
      var colors = getColors();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, 0);
      gl.uniform3fv(uDeep, colors.deep);
      gl.uniform3fv(uViolet, colors.violet);
      gl.uniform3fv(uLavender, colors.lavender);
      gl.uniform3fv(uPale, colors.pale);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      render();
    }

    window.addEventListener('resize', debounce(function () { resize(); }, 200));

    window.pkHeroGL = {
      canvas: canvas,
      gl: gl,
      stop: function () { visible = false; if (animFrame) cancelAnimationFrame(animFrame); },
      start: function () { visible = true; render(); },
    };
  }

  function compileShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[hero-geometric] Shader compile error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function applyFallback(el) {
    el.style.background = 'linear-gradient(135deg, #061A3D 0%, #8B5CF6 40%, #C4A3FF 70%, #F4F1FF 100%)';
    el.classList.add('pk-hero-fallback');
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
