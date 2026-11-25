import * as THREE from 'three';

// Floating name label: one small canvas texture per character, redrawn only when the
// seeker flag flips. The sprite is a child of the character group, so it follows its
// visibility (line of sight) and animation-free transform for free.
const W = 256, H = 64;

function draw(ctx, name, seeker) {
  ctx.clearRect(0, 0, W, H);
  ctx.font = '700 34px system-ui, -apple-system, "Segoe UI", sans-serif';
  const width = Math.min(W - 8, ctx.measureText(name).width + 44);
  const x = (W - width) / 2;
  ctx.beginPath();
  ctx.roundRect(x, 8, width, 48, 24);
  ctx.fillStyle = seeker ? 'rgba(200, 38, 60, .92)' : 'rgba(14, 24, 40, .78)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = seeker ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.35)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(name, W / 2, 33, W - 40);
}

export class NameTag {
  constructor(name, height = 2.0) {
    this.name = name;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.texture, transparent: true, depthWrite: false, fog: false,
    }));
    this.sprite.material.userData.tagTexture = this.texture;
    this.sprite.userData.shared = true; // sprites share one built-in geometry
    this.sprite.scale.set(1.3, 0.325, 1);
    this.sprite.position.y = height;
    this.sprite.renderOrder = 5;
    this.seeker = null;
    this.setSeeker(false);
  }

  setSeeker(on) {
    on = Boolean(on);
    if (this.seeker === on) return;
    this.seeker = on;
    draw(this.ctx, this.name, on);
    this.texture.needsUpdate = true;
  }
}
