// "Three taps": a phone lying on stone; its screen is the only bright light. Weight → Buy → Confirmed,
// and the bar beside it warms when the purchase lands. A real screenshot can replace the drawn screens.
export default {
  id: 'phone-taps',
  name: 'App · three taps',
  description: 'A matte onyx phone lying on black stone, seen from above at a long lens. Its screen runs the Goldcom buy flow (choose 1 g, Buy, confirmed) with soft tap ripples on the beat. A minted bar lies beside it and catches the screen light; it warms on confirm. Pass a screenshot URL to show your own screen instead.',
  idea: { en: 'Buying real gold takes three taps in the app.', ar: 'شراء الذهب الحقيقي بثلاث نقرات في التطبيق.' },
  tags: ['app', 'ui', 'buy', 'product', 'explainer'],
  duration: 7,
  still: 6.2,
  textZone: 'top',
  focusY: 0.6,
  params: [
    { key: 'weight', label: 'Weight bought', type: 'select', options: ['1 g', '2.5 g', '5 g', '10 g'], default: '1 g' },
    { key: 'price', label: 'Indicative price shown', type: 'text', default: '31.204', hint: 'OMR per gram, illustrative' },
    { key: 'screenshot', label: 'Screenshot URL (optional)', type: 'asset', default: '' },
  ],
  assets: (p) => (p.screenshot ? [p.screenshot] : []),
  create({ THREE, kit, params, theme, lang, aspect, loop, asset }) {
    const { ease, seg, mix, clamp } = kit;
    const ar = lang === 'ar';
    const scene = new THREE.Scene();
    const staging = kit.stage(scene, { theme, aspect, glowY: 0.5, glow: 0.4 });
    if (staging.floor) staging.floor.material.uniforms.strength.value = 0.2;
    const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 100);

    // ---------- phone ----------
    const PW = 0.76, PH = 1.6, PD = 0.07;
    const body = new THREE.Mesh(kit.roundedBox(PW, PH, PD, 0.11, 6), new THREE.MeshPhysicalMaterial({ color: '#141413', metalness: 0.6, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
    const SW = 1080 / 2, SH = Math.round((SW * (PH - 0.05)) / (PW - 0.05));
    const screenTex = kit.canvasTexture(SW, SH);
    const shot = params.screenshot ? asset(params.screenshot) : null;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(PW - 0.05, PH - 0.05),
      new THREE.MeshPhysicalMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: screenTex, emissiveIntensity: 1.05, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0 }),
    );
    screen.position.z = PD / 2 + 0.001;
    const phone = new THREE.Group();
    phone.add(body, screen);
    scene.add(phone);
    // Rounded screen mask: draw the UI inside a rounded rect so the corners match the body.
    const R = 34;

    // ---------- bar beside the phone ----------
    const stamp = kit.barStamp({ weight: params.weight, lang, aspect: 15 / 8.7 });
    const barMatFace = kit.materials.gold({ normalMap: stamp.normalMap, roughnessMap: stamp.roughnessMap, roughness: 1, normalScale: 0.8 });
    const bar = new THREE.Mesh(kit.barGeometry({ w: 0.3, h: 0.52, d: 0.04, r: 0.025, bevel: 0.008 }), [barMatFace, kit.materials.satin()]);
    bar.rotation.set(-Math.PI / 2, 0, 0.5);
    bar.position.set(0.5, 0.021, 0.36);
    scene.add(bar);
    const barShadow = kit.contactShadow({ size: 0.9, opacity: 0.55 });
    barShadow.position.set(0.5, 0.002, 0.36);
    const phoneShadow = kit.contactShadow({ size: 2.2, opacity: 0.6 });
    phoneShadow.scale.set(0.7, 1.15, 1);
    phoneShadow.position.set(-0.1, 0.002, 0);
    scene.add(barShadow, phoneShadow);
    // Screen glow reaching the bar (kept low and to the side so it never shows as a hot spot on the glass).
    const screenLight = new THREE.PointLight('#E9E2D6', 0.5, 0.9, 1.6);
    scene.add(screenLight);

    // ---------- screen UI ----------
    const GOLD = '#DBA761', SPARK = '#F2D46B';
    const L = ar
      ? { hi: 'مساء الخير', buy: 'شراء ذهب', weight: 'اختر الوزن', price: 'السعر الاسترشادي للجرام', cta: 'شراء', done: 'تمت الإضافة إلى رصيدك', vault: 'محفوظ باسمك', unit: 'ر.ع.' }
      : { hi: 'Good evening', buy: 'Buy gold', weight: 'Choose weight', price: 'Indicative price per gram', cta: 'Buy', done: 'Added to your gold', vault: 'Held in your name', unit: 'OMR' };
    const weights = ['1 g', '2.5 g', '5 g', '10 g'];
    const sel = Math.max(0, weights.indexOf(params.weight));
    const X = (x, w = 0) => (ar ? SW - x - w : x);
    function ui(T) {
      const c = screenTex.userData.ctx;
      c.save();
      c.clearRect(0, 0, SW, SH);
      c.beginPath(); c.roundRect(0, 0, SW, SH, R); c.clip();
      if (shot?.image) { c.drawImage(shot.image, 0, 0, SW, SH); c.restore(); screenTex.needsUpdate = true; return; }
      c.fillStyle = '#121211'; c.fillRect(0, 0, SW, SH);
      const g = c.createRadialGradient(SW / 2, 0, 0, SW / 2, 0, SH * 0.6);
      g.addColorStop(0, 'rgba(219,167,97,0.16)'); g.addColorStop(1, 'rgba(219,167,97,0)');
      c.fillStyle = g; c.fillRect(0, 0, SW, SH);
      const al = ar ? 'right' : 'left';
      c.fillStyle = '#FFFFFF';
      kit.drawText(c, '9:41', X(38), 40, { size: 22, weight: 600, align: al, rtl: false });
      const tapA = seg(T, 1.3, 1.6), tapB = seg(T, 2.6, 2.9);
      const confirmed = ease.snap(seg(T, 3.2, 3.7));
      if (confirmed < 1) {
        c.globalAlpha = 1 - confirmed;
        c.fillStyle = '#9A968C'; kit.drawText(c, L.hi, X(38), 120, { size: 22, weight: 500, align: al });
        c.fillStyle = '#FFFFFF'; kit.drawText(c, L.buy, X(38), 168, { size: 40, weight: 700, align: al });
        c.fillStyle = '#9A968C'; kit.drawText(c, L.price, X(38), 250, { size: 20, weight: 500, align: al });
        c.fillStyle = '#FFFFFF'; kit.drawText(c, `${params.price}`, X(38), 312, { size: 64, weight: 700, align: al, rtl: false });
        c.fillStyle = GOLD; kit.drawText(c, L.unit, X(38 + (ar ? 0 : 0)), 360, { size: 22, weight: 600, align: al });
        c.fillStyle = '#9A968C'; kit.drawText(c, L.weight, X(38), 460, { size: 20, weight: 500, align: al });
        const cw = (SW - 76 - 3 * 14) / 4;
        weights.forEach((w, i) => {
          const x = X(38 + i * (cw + 14), cw);
          const on = i === sel && T > 1.35;
          c.fillStyle = on ? GOLD : '#252523';
          c.beginPath(); c.roundRect(x, 492, cw, 70, 16); c.fill();
          c.fillStyle = on ? '#151513' : '#FFFFFF';
          kit.drawText(c, w, x + cw / 2, 528, { size: 24, weight: 700, rtl: false });
        });
        const by = SH - 190;
        const press = 1 - 0.04 * Math.sin(Math.PI * clamp(tapB * 2));
        c.save(); c.translate(SW / 2, by + 44); c.scale(press, press); c.translate(-SW / 2, -(by + 44));
        c.fillStyle = SPARK; c.beginPath(); c.roundRect(38, by, SW - 76, 88, 44); c.fill();
        c.fillStyle = '#151513'; // Isolate the Latin weight so Arabic bidi keeps "1 g" in order.
        kit.drawText(c, `${L.cta} \u2066${params.weight}\u2069`, SW / 2, by + 45, { size: 30, weight: 700 });
        c.restore();
        // Tap ripples land on the beat.
        const ripple = (p, x, y) => { if (p <= 0 || p >= 1) return; c.strokeStyle = `rgba(255,255,255,${0.55 * (1 - p)})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 14 + p * 46, 0, Math.PI * 2); c.stroke(); };
        ripple(tapA, X(38 + sel * (cw + 14), cw) + cw / 2, 527);
        ripple(tapB, SW / 2, by + 44);
        c.globalAlpha = 1;
      }
      if (confirmed > 0) {
        c.globalAlpha = confirmed;
        const cy = SH * 0.38;
        c.strokeStyle = SPARK; c.lineWidth = 6;
        c.beginPath(); c.arc(SW / 2, cy, 64 * (0.85 + 0.15 * confirmed), 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(SW / 2 - 26, cy + 2); c.lineTo(SW / 2 - 6, cy + 22); c.lineTo(SW / 2 + 30, cy - 20); c.stroke();
        c.fillStyle = '#FFFFFF'; kit.drawText(c, `+\u2009${params.weight}`, SW / 2, cy + 140, { size: 64, weight: 700, rtl: false });
        c.fillStyle = '#9A968C'; kit.drawText(c, L.done, SW / 2, cy + 200, { size: 24, weight: 500 });
        c.fillStyle = GOLD; kit.drawText(c, L.vault, SW / 2, cy + 240, { size: 20, weight: 600 });
        c.globalAlpha = 1;
      }
      c.restore();
      screenTex.needsUpdate = true;
    }

    return {
      scene, camera,
      update(t, { dur }) {
        const T = loop ? t % dur : t;
        ui(T);
        // The phone lies tilted on the stone: long lens, slight orbit.
        phone.rotation.set(-Math.PI / 2, 0, -0.18);
        phone.position.set(-0.1, PD / 2 + 0.001, 0);
        screenLight.position.set(0.32, 0.12, 0.22);
        const warm = ease.settle(seg(T, 3.3, 4.3)) * (loop ? 1 - ease.cubicInOut(seg(T, dur - 0.8, dur)) : 1);
        barMatFace.envMapIntensity = mix(0.85, 1.35, warm);
        barMatFace.color.set('#FFD27A').lerp(new THREE.Color('#FFE2A0'), warm * 0.5);
        const dist = kit.fitBox(camera, 1.55, 1.25, aspect, { fillW: 0.9, fillH: 0.66 });
        kit.orbit(camera, { target: new THREE.Vector3(0.05, 0.1, 0.05), distance: dist * (1 - ease.glide(seg(t, 0, 8)) * 0.05), azimuth: mix(-0.2, -0.05, ease.glide(seg(t, 0, loop ? dur : 8))), elevation: 0.62 });
      },
      post: { bloom: 0.08, bloomThreshold: 2, vignette: 0.32 },
    };
  },
};
