// Drives the rigged F1 model (f1_rigged.glb): wheel spin, front-wheel steering,
// brake lights and a flashing rain light.
//
// Model conventions: car faces local +Z, left is +X, up is +Y.
import * as THREE from "three";

const BRAKE_OFF = 0.15;
const BRAKE_ON = 6.0;
const RIG_VERSION = 2;

export class F1CarController {
  constructor(root, opts = {}) {
    this.root = root;
    this.maxSteer = opts.maxSteer ?? THREE.MathUtils.degToRad(28);
    this.maxSpeed = opts.maxSpeed ?? 90;
    this.maxReverse = opts.maxReverse ?? 15;
    this.accel = opts.accel ?? 28;
    this.brakeDecel = opts.brakeDecel ?? 70;
    this.drag = opts.drag ?? 0.6;
    this.steerSpeed = opts.steerSpeed ?? 4;
    this.maxSpinStep = opts.maxSpinStep ?? 0.4;

    const get = (name) => {
      const o = root.getObjectByName(name);
      if (!o) throw new Error(`F1 model is missing node "${name}"`);
      return o;
    };
    if (get("F1_Car").userData.rigVersion !== RIG_VERSION) {
      console.warn(
        `F1CarController: this is an old f1_rigged.glb (wheels are tilted and will wobble). ` +
          `Replace it with the latest export (rigVersion ${RIG_VERSION}) and hard-refresh.`
      );
    }
    this.spinNodes = ["FL_Spin", "FR_Spin", "RL_Spin", "RR_Spin"].map(get);
    this.steerNodes = ["FL_Steer", "FR_Steer"].map(get);

    this.brakeMaterial = null;
    root.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith("BrakeLight")) return;
      if (!this.brakeMaterial) {
        this.brakeMaterial = o.material.clone();
        this.brakeMaterial.emissive.setRGB(1, 0.02, 0.01);
        this.brakeMaterial.toneMapped = false;
      }
      o.material = this.brakeMaterial;
    });

    root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(this.spinNodes[2]).getSize(new THREE.Vector3());
    this.wheelRadius = Math.max(size.y / 2, 0.05);
    const front = this.steerNodes[0].getWorldPosition(new THREE.Vector3());
    const rear = this.spinNodes[2].getWorldPosition(new THREE.Vector3());
    this.wheelbase = Math.max(front.distanceTo(rear), 0.5);

    this.speed = 0;
    this.steer = 0;
    this.targetSteer = 0;
    this.braking = false;
    this.rainLight = false;
    this._brakeLevel = BRAKE_OFF;
    this._time = 0;
  }

  setSpeed(v) {
    this.speed = v;
  }
  setSteer(angle) {
    this.targetSteer = THREE.MathUtils.clamp(angle, -this.maxSteer, this.maxSteer);
  }
  setBraking(on) {
    this.braking = on;
  }
  setRainLight(on) {
    this.rainLight = on;
  }

  update(dt) {
    this._time += dt;

    const k = 1 - Math.exp(-this.steerSpeed * dt);
    this.steer += (this.targetSteer - this.steer) * k;
    for (const n of this.steerNodes) n.rotation.y = this.steer;

    const dTheta = THREE.MathUtils.clamp((this.speed * dt) / this.wheelRadius, -this.maxSpinStep, this.maxSpinStep);
    for (const n of this.spinNodes) n.rotation.set((n.rotation.x + dTheta) % (Math.PI * 2), 0, 0);

    let target = this.braking ? BRAKE_ON : BRAKE_OFF;
    if (this.rainLight && !this.braking) {
      target = Math.sin(this._time * Math.PI * 8) > 0 ? BRAKE_ON * 0.6 : BRAKE_OFF;
    }
    this._brakeLevel += (target - this._brakeLevel) * (1 - Math.exp(-30 * dt));
    if (this.brakeMaterial) this.brakeMaterial.emissiveIntensity = this._brakeLevel;
  }
}
