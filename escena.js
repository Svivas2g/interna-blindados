// Escenas de la interna de Blindados. Sin librerías, para no cargar la página de pauta.
// El título y los botones se pintan sin esperar este archivo: aquí solo se agrega el movimiento.
(() => {
  'use strict';

  const raiz = document.documentElement;
  if (!raiz.classList.contains('anima')) return;

  const tope = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const tramo = (a, b, x) => tope((x - a) / (b - a));
  const suave = (t) => t * t * (3 - 2 * t);

  const SHADER_VERTICES = `
    attribute vec2 aPos;
    varying vec2 vU;
    void main() {
      vU = aPos * .5 + .5;
      gl_Position = vec4(aPos, 0., 1.);
    }`;

  // El vidrio como lente: de lejos es la foto; al acercarse se vuelve canales que
  // deforman lo que hay detrás, y al atravesarlos la imagen queda limpia.
  const SHADER_PIXELES = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uA, uB;
    uniform vec2 uLienzo, uTamA, uTamB, uFoco, uPuntero;
    uniform float uP, uBarrido, uLuzPuntero;
    varying vec2 vU;

    const vec3 CIELO = vec3(.424, .827, .976);

    vec2 cubrir(vec2 u, vec2 tam) {
      float rl = uLienzo.x / uLienzo.y;
      float rt = tam.x / tam.y;
      vec2 e = rl > rt ? vec2(1., rt / rl) : vec2(rl / rt, 1.);
      return (u - .5) * e + .5;
    }

    float luz(vec3 c) { return dot(c, vec3(.3, .59, .11)); }

    void main() {
      vec2 u = vU;
      float p = uP;
      float aspecto = uLienzo.x / uLienzo.y;

      float acerca = smoothstep(0., .55, p);
      float zoom = mix(1., 6.5, acerca * acerca);

      float fuerza = smoothstep(.2, .5, p) * (1. - smoothstep(.62, .96, p));
      float abierto = smoothstep(.26, .98, p);
      float n = mix(30., 2.4, pow(abierto, .62)) * min(1., aspecto * 1.1);
      float x = (u.x - .5) * n + .5;
      float s = fract(x) - .5;
      float corrimiento = s / n * 5.2 * fuerza;

      vec2 centro = mix(uFoco, vec2(.5), acerca);
      vec2 ua = uFoco + (cubrir(u, uTamA) - centro) / zoom;
      ua.x += corrimiento / zoom;
      vec3 a = texture2D(uA, ua).rgb;

      float escalaB = mix(1.16, 1., smoothstep(.36, 1., p));
      vec2 ub = (cubrir(u, uTamB) - .5) / escalaB + .5;
      vec3 b = vec3(
        texture2D(uB, ub + vec2(corrimiento * 1.045, 0.)).r,
        texture2D(uB, ub + vec2(corrimiento, 0.)).g,
        texture2D(uB, ub + vec2(corrimiento * .955, 0.)).b
      );
      b = mix(b, b * vec3(.38, .68, .82), fuerza * .8);

      float lejania = abs(u.x - .5) * 2.;
      float revela = smoothstep(.32 + .16 * lejania, .58 + .16 * lejania, p);
      vec3 color = mix(a, b, revela);

      float borde = abs(s) * 2.;
      color *= 1. - .34 * fuerza * borde;
      color += CIELO * pow(borde, 22.) * fuerza * .55;
      color += CIELO * smoothstep(.22, .5, s) * fuerza * .07;

      float visible = 1. - acerca;
      float brillo = pow(luz(a), 1.25);
      float pasada = exp(-pow((u.x + (1. - u.y) * .45 - uBarrido) * 4.2, 2.));
      color += CIELO * brillo * pasada * visible * 1.5;
      vec2 d = (u - uPuntero) * vec2(aspecto, 1.);
      float foco = exp(-dot(d, d) * 11.) * uLuzPuntero;
      color += CIELO * (brillo * 1.5 + .025) * foco * visible;

      gl_FragColor = vec4(color, 1.);
    }`;

  function crearVidrio(lienzo, fotoA, fotoB) {
    const gl = lienzo.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return null;

    const compilar = (tipo, fuente) => {
      const s = gl.createShader(tipo);
      gl.shaderSource(s, fuente);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compilar(gl.VERTEX_SHADER, SHADER_VERTICES);
    const fs = compilar(gl.FRAGMENT_SHADER, SHADER_PIXELES);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    for (const nombre of ['uA', 'uB', 'uLienzo', 'uTamA', 'uTamB', 'uFoco', 'uPuntero', 'uP', 'uBarrido', 'uLuzPuntero']) {
      u[nombre] = gl.getUniformLocation(prog, nombre);
    }

    const textura = (unidad, img, uTam) => {
      gl.activeTexture(gl.TEXTURE0 + unidad);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform2f(uTam, img.naturalWidth, img.naturalHeight);
    };

    gl.uniform1i(u.uA, 0);
    gl.uniform1i(u.uB, 1);

    const vertical = matchMedia('(orientation: portrait)');
    const subir = () => {
      // Punto del canto hacia donde entra la cámara, en fracciones de cada encuadre.
      if (vertical.matches) gl.uniform2f(u.uFoco, .73, .5);
      else gl.uniform2f(u.uFoco, .8, .56);
      textura(0, fotoA, u.uTamA);
      textura(1, fotoB, u.uTamB);
    };

    const ajustar = () => {
      const escala = Math.min(devicePixelRatio || 1, 1.5);
      const w = Math.round(lienzo.clientWidth * escala);
      const h = Math.round(lienzo.clientHeight * escala);
      if (lienzo.width !== w || lienzo.height !== h) {
        lienzo.width = w;
        lienzo.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u.uLienzo, w, h);
      }
    };

    const dibujar = (p, barrido, puntero, luzPuntero) => {
      ajustar();
      gl.uniform1f(u.uP, p);
      gl.uniform1f(u.uBarrido, barrido);
      gl.uniform2f(u.uPuntero, puntero.x, puntero.y);
      gl.uniform1f(u.uLuzPuntero, luzPuntero);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    return { subir, dibujar, vertical };
  }

  // Elementos

  const secVidrio = document.querySelector('.vidrio');
  const portada = document.querySelector('.portada');
  const revelado = document.querySelector('.revelado');
  const lienzo = document.querySelector('.lienzo');
  const imgA = document.querySelector('.foto--a img');
  const imgB = document.querySelector('.foto--b img');
  const fotoB = document.querySelector('.foto--b');

  const secHoja = document.querySelector('.protocolo');
  const hoja = document.querySelector('.hoja');
  const tachas = [...document.querySelectorAll('.tacha')];
  const temas = [...document.querySelectorAll('.temas li')];
  const cierreHoja = document.querySelector('.protocolo__cierre');
  const resalte = document.querySelector('.resalte');
  const pista = document.querySelector('.portada__pista');

  // Estado

  const movimiento = {
    vidrio: { actual: 0, visible: true },
    hoja: { actual: 0, visible: false },
  };
  const puntero = { x: .75, y: .5, objX: .75, objY: .5, luz: 0, objLuz: 0 };
  const DURACION_PASADA = 1900;
  const CADA_CUANTO_PASADA = 9000;

  let vidrio = null;
  let pasadaInicio = -1;
  let corriendo = false;

  const progresoDe = (seccion) => {
    const caja = seccion.getBoundingClientRect();
    return tope(-caja.top / (caja.height - innerHeight));
  };

  function pintarVidrio(p, ahora) {
    const sale = suave(tramo(.03, .15, p));
    portada.style.opacity = 1 - sale;
    portada.style.transform = `translate3d(0, ${-28 * sale}px, 0)`;
    portada.style.visibility = sale >= 1 ? 'hidden' : 'visible';

    const entra = suave(tramo(.8, .92, p));
    revelado.style.opacity = entra;
    revelado.style.transform = `translate3d(0, ${(1 - entra) * 28}px, 0)`;

    if (vidrio) {
      let barrido = -1;
      if (pasadaInicio >= 0) {
        const t = (ahora - pasadaInicio) / DURACION_PASADA;
        if (t >= 1) pasadaInicio = -1;
        else if (t >= 0) barrido = -.3 + suave(t) * 2;
      }
      vidrio.dibujar(p, barrido, puntero, puntero.luz);
    } else if (raiz.classList.contains('sin-gl')) {
      fotoB.style.opacity = suave(tramo(.3, .7, p));
    }
  }

  function pintarHoja(p) {
    const giro = 1 - suave(tramo(0, .2, p));
    hoja.style.transform =
      `perspective(1400px) rotateX(${giro * 9}deg) rotateY(${giro * -13}deg) translate3d(0, ${giro * 36}px, 0)`;

    tachas.forEach((tacha, i) => {
      const inicio = .16 + i * .115;
      tacha.style.transform = `scaleX(${suave(tramo(inicio, inicio + .09, p))})`;
    });
    resalte.style.transform = `scaleX(${suave(tramo(.76, .86, p))})`;

    const activo = p < .42 ? 0 : p < .66 ? 1 : 2;
    temas.forEach((tema, i) => tema.classList.toggle('activo', i === activo));

    cierreHoja.style.opacity = suave(tramo(.84, .94, p));
  }

  function cuadro(ahora) {
    let sigue = false;

    if (movimiento.vidrio.visible) {
      const m = movimiento.vidrio;
      const objetivo = progresoDe(secVidrio);
      const antes = m.actual;
      m.actual += (objetivo - m.actual) * .13;
      if (Math.abs(objetivo - m.actual) < .0004) m.actual = objetivo;

      puntero.x += (puntero.objX - puntero.x) * .1;
      puntero.y += (puntero.objY - puntero.y) * .1;
      puntero.luz += (puntero.objLuz - puntero.luz) * .08;
      if (Math.abs(puntero.objLuz - puntero.luz) < .002) puntero.luz = puntero.objLuz;

      const conPuntero = puntero.luz > 0 && m.actual < .3;
      const conPasada = pasadaInicio >= 0;
      if (m.actual !== antes || conPuntero || conPasada || !m.pintado) {
        pintarVidrio(m.actual, ahora);
        m.pintado = true;
        sigue = true;
      }
    }

    if (movimiento.hoja.visible) {
      const m = movimiento.hoja;
      const objetivo = progresoDe(secHoja);
      const antes = m.actual;
      m.actual += (objetivo - m.actual) * .16;
      if (Math.abs(objetivo - m.actual) < .0004) m.actual = objetivo;
      if (m.actual !== antes || !m.pintado) {
        pintarHoja(m.actual);
        m.pintado = true;
        sigue = true;
      }
    }

    corriendo = sigue;
    if (sigue) requestAnimationFrame(cuadro);
  }

  function despertar() {
    if (corriendo) return;
    corriendo = true;
    requestAnimationFrame(cuadro);
  }

  // Visibilidad y scroll

  const vigia = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const m = e.target === secVidrio ? movimiento.vidrio : movimiento.hoja;
      m.visible = e.isIntersecting;
      m.pintado = false;
    }
    despertar();
  }, { rootMargin: '10% 0px' });
  vigia.observe(secVidrio);
  vigia.observe(secHoja);

  addEventListener('scroll', despertar, { passive: true });
  addEventListener('resize', () => {
    movimiento.vidrio.pintado = false;
    movimiento.hoja.pintado = false;
    despertar();
  });

  // Luz que sigue al puntero sobre el vidrio

  if (matchMedia('(hover: hover)').matches) {
    secVidrio.addEventListener('pointermove', (e) => {
      puntero.objX = e.clientX / innerWidth;
      puntero.objY = 1 - e.clientY / innerHeight;
      puntero.objLuz = 1;
      despertar();
    }, { passive: true });
    secVidrio.addEventListener('pointerleave', () => {
      puntero.objLuz = 0;
      despertar();
    }, { passive: true });
  }

  // "Mirar a través del vidrio" recorre la escena sola, a un ritmo que deja ver el efecto.

  const DURACION_RECORRIDO = 3400;
  let recorriendo = 0;

  const cancelarRecorrido = () => { recorriendo = 0; };
  addEventListener('wheel', cancelarRecorrido, { passive: true });
  addEventListener('touchstart', cancelarRecorrido, { passive: true });

  pista.addEventListener('click', (e) => {
    e.preventDefault();
    const desde = scrollY;
    const caja = secVidrio.getBoundingClientRect();
    const hasta = caja.top + scrollY + caja.height - innerHeight;
    const inicio = performance.now();
    const turno = ++recorriendo;
    const paso = (ahora) => {
      if (turno !== recorriendo) return;
      const t = tramo(0, DURACION_RECORRIDO, ahora - inicio);
      scrollTo({ top: desde + (hasta - desde) * suave(t), behavior: 'instant' });
      if (t < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });

  // Una pasada de luz al abrir y otra cada tanto mientras el visitante sigue en la portada

  function programarPasada(demora) {
    setTimeout(() => {
      if (!document.hidden && movimiento.vidrio.visible && movimiento.vidrio.actual < .02) {
        pasadaInicio = performance.now();
        despertar();
      }
      programarPasada(CADA_CUANTO_PASADA);
    }, demora);
  }

  // El efecto arranca después de pintar: la foto fija ya está en pantalla y no se toca.

  async function iniciarVidrio() {
    try {
      await Promise.all([imgA.decode(), imgB.decode()]);
    } catch (error) {
      raiz.classList.add('sin-gl');
      despertar();
      return;
    }
    vidrio = crearVidrio(lienzo, imgA, imgB);
    try {
      if (vidrio) vidrio.subir();
    } catch (error) {
      // Al abrir el archivo sin servidor, el navegador no deja pasar las fotos a WebGL.
      vidrio = null;
    }
    if (!vidrio) {
      raiz.classList.add('sin-gl');
      despertar();
      return;
    }
    vidrio.vertical.addEventListener('change', async () => {
      await Promise.all([imgA.decode(), imgB.decode()]).catch(() => {});
      vidrio.subir();
      movimiento.vidrio.pintado = false;
      despertar();
    });
    lienzo.addEventListener('webglcontextlost', () => {
      vidrio = null;
      lienzo.classList.remove('listo');
      raiz.classList.add('sin-gl');
    });

    movimiento.vidrio.pintado = false;
    pintarVidrio(movimiento.vidrio.actual, performance.now());
    lienzo.classList.add('listo');
    programarPasada(500);
    despertar();
  }

  const cuandoLibre = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const arrancar = () => cuandoLibre(iniciarVidrio, { timeout: 1200 });
  if (document.readyState === 'complete') arrancar();
  else addEventListener('load', arrancar, { once: true });

  despertar();
})();
