/* Vector icons for weapons, passives and pickups, drawn on a 32x32 grid. Used by the HUD and the DOM menus. */
(function (OO) {
  'use strict';

  const Icons = {};
  const cache = {};

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }

  Icons.draw = function (ctx, id, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 32, size / 32);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (id) {
      case 'pistol':
        poly(ctx, [5, 9, 27, 9, 27, 15, 16, 15, 14, 25, 7, 25, 9, 15, 5, 15]); ctx.fill();
        ctx.strokeRect(15.5, 15.5, 4, 4);
        break;
      case 'knife':
        poly(ctx, [12, 15, 29, 5, 25, 15, 12, 19]); ctx.fill();
        poly(ctx, [3, 23, 10, 17, 12, 20, 5, 26]); ctx.fill();
        ctx.beginPath(); ctx.moveTo(10, 13); ctx.lineTo(13, 22); ctx.stroke();
        break;
      case 'shotgun':
        ctx.fillRect(9, 11, 21, 3.5);
        ctx.fillRect(14, 15, 9, 3.5);
        poly(ctx, [2, 11, 10, 11, 10, 17, 4, 22, 1, 19]); ctx.fill();
        break;
      case 'grenade':
        ctx.beginPath(); ctx.arc(16, 20, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(12.5, 8, 7, 4);
        ctx.beginPath(); ctx.moveTo(19, 9); ctx.lineTo(25, 6); ctx.lineTo(25, 14); ctx.stroke();
        ctx.beginPath(); ctx.arc(10, 8, 3, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'saw': {
        ctx.beginPath();
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2, r = i % 2 ? 10 : 14;
          ctx.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(16, 16, 4, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'tesla':
        poly(ctx, [19, 2, 7, 18, 15, 18, 11, 30, 25, 12, 17, 12, 21, 2]); ctx.fill();
        break;
      case 'might':
        ctx.beginPath(); ctx.moveTo(11, 28); ctx.lineTo(11, 14); ctx.quadraticCurveTo(16, 2, 21, 14); ctx.lineTo(21, 28); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(9, 17, 14, 2.2);
        ctx.beginPath(); ctx.arc(16, 9.5, 1.8, 0, Math.PI * 2); ctx.fill();
        break;
      case 'armor':
        poly(ctx, [8, 4, 13, 4, 16, 8, 19, 4, 24, 4, 27, 10, 25, 14, 25, 28, 7, 28, 7, 14, 5, 10]); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(10, 17, 12, 2); ctx.fillRect(10, 22, 12, 2);
        break;
      case 'speed':
        ctx.save(); ctx.translate(16, 16); ctx.rotate(-Math.PI / 4);
        ctx.strokeRect(-4, -9, 8, 16);
        ctx.fillRect(-4, -1, 8, 8);
        ctx.fillRect(-1, 7, 2, 7);
        ctx.fillRect(-1, -14, 2, 5); ctx.fillRect(-5, -15, 10, 2);
        ctx.restore();
        break;
      case 'area':
        ctx.beginPath();
        ctx.moveTo(16, 3);
        ctx.bezierCurveTo(22, 11, 27, 15, 25, 22);
        ctx.bezierCurveTo(23, 29, 9, 29, 7, 22);
        ctx.bezierCurveTo(6, 17, 10, 14, 11, 9);
        ctx.bezierCurveTo(13, 13, 14, 14, 15, 15);
        ctx.bezierCurveTo(16, 11, 17, 7, 16, 3);
        ctx.fill();
        break;
      case 'cooldown':
        ctx.beginPath(); ctx.arc(16, 16, 13, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(16 + Math.cos(a) * 7.5, 16 + Math.sin(a) * 7.5, 3, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'magnet':
        ctx.lineWidth = 6; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(8, 5); ctx.lineTo(8, 17); ctx.arc(16, 17, 8, Math.PI, 0, true); ctx.lineTo(24, 5); ctx.stroke();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(4, 8, 24, 2);
        break;
      case 'maxhp':
        ctx.strokeRect(4, 7, 24, 20);
        ctx.fillRect(12, 3, 8, 4);
        ctx.fillRect(14, 11, 4, 12); ctx.fillRect(10, 15, 12, 4);
        break;
      case 'amount':
        ctx.beginPath(); ctx.moveTo(10, 4); ctx.lineTo(19, 4); ctx.lineTo(22, 28); ctx.lineTo(13, 28); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 4; i++) ctx.fillRect(9, 8 + i * 5, 16, 1.6);
        break;
      case 'herb':
        ctx.beginPath(); ctx.moveTo(16, 29); ctx.quadraticCurveTo(3, 18, 16, 3); ctx.quadraticCurveTo(29, 18, 16, 29); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(16, 27); ctx.lineTo(16, 8); ctx.stroke();
        break;
      case 'credits':
        ctx.beginPath(); ctx.arc(16, 16, 12, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(16, 16, 6, 0.8, Math.PI * 2 - 0.8); ctx.stroke();
        break;
      case 'dna':
        ctx.lineWidth = 2.6;
        for (const ph of [0, Math.PI]) {
          ctx.beginPath();
          for (let y = 3; y <= 29; y += 1) ctx.lineTo(16 + Math.sin(y * 0.38 + ph) * 8, y);
          ctx.stroke();
        }
        ctx.lineWidth = 1.6;
        for (let y = 6; y <= 27; y += 4.2) {
          ctx.beginPath(); ctx.moveTo(16 + Math.sin(y * 0.38) * 8, y); ctx.lineTo(16 + Math.sin(y * 0.38 + Math.PI) * 8, y); ctx.stroke();
        }
        break;
      case 'reroll':
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(16, 16, 10, -0.3, Math.PI * 1.35); ctx.stroke();
        poly(ctx, [26, 4, 28, 14, 18, 11]); ctx.fill();
        break;
      case 'skull':
        ctx.beginPath(); ctx.arc(16, 14, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(10, 18, 12, 9);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(12, 14, 3, 0, Math.PI * 2); ctx.arc(20, 14, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(13, 23, 1.6, 4); ctx.fillRect(18, 23, 1.6, 4);
        break;
      default:
        ctx.fillRect(8, 8, 16, 16);
    }
    ctx.restore();
  };

  /**
   * Cached offscreen canvas of an icon at 2x resolution. Always blit icons from here:
   * some icons cut holes with destination-out, which must never run on the game canvas.
   */
  Icons.image = function (id, size, color) {
    const key = 'c' + id + size + color;
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    Icons.draw(c.getContext('2d'), id, 0, 0, size * 2, color);
    return (cache[key] = c);
  };

  /** Cached PNG data URL, for <img> tags in the DOM menus. */
  Icons.url = function (id, size, color) {
    const key = 'u' + id + size + color;
    if (cache[key]) return cache[key];
    return (cache[key] = Icons.image(id, size, color).toDataURL());
  };

  OO.Icons = Icons;
})(window.OO = window.OO || {});
