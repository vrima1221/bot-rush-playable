// GPU walk cycle for instanced crowds (no CPU cost).
// Each vertex has `limb` = (pivotY, side, type): type 1 = leg, 2 = arm, 0 = body.
// The phase comes from the instance's world translation, so the stride matches the
// distance walked (a standing crowd stands still) and neighbours are out of step.
import * as THREE from 'three';

/**
 * @param {THREE.Material} material  a Phong/Lambert material used by an InstancedMesh
 * @param {object} o  { key, stride (world units per step cycle), legAmp, armAmp, bob, roll }
 */
export function applyWalk(material, o) {
  const uniforms = {
    uStride: { value: (Math.PI * 2) / o.stride },
    uLegAmp: { value: o.legAmp },
    uArmAmp: { value: o.armAmp },
    uBob: { value: o.bob },
    uRoll: { value: o.roll },
  };
  material.userData.walk = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 limb;
uniform float uStride;
uniform float uLegAmp;
uniform float uArmAmp;
uniform float uBob;
uniform float uRoll;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wPhase = instanceMatrix[3].z * uStride + instanceMatrix[3].x * 1.7;
#else
  float wPhase = 0.0;
#endif
  float wS = sin(wPhase);
  if (limb.z > 0.5) {
    float ang = limb.z < 1.5 ? limb.y * wS * uLegAmp : -limb.y * wS * uArmAmp;
    float py = transformed.y - limb.x;
    float c = cos(ang);
    float s = sin(ang);
    transformed.y = limb.x + py * c - transformed.z * s;
    transformed.z = py * s + transformed.z * c;
  } else {
    // body roll (waddle) about the vertical axis line
    float r = wS * uRoll;
    float px = transformed.x;
    float py2 = transformed.y;
    transformed.x = px * cos(r) - py2 * sin(r);
    transformed.y = px * sin(r) + py2 * cos(r);
  }
  transformed.y += abs(cos(wPhase)) * uBob;`,
      );
  };
  material.customProgramCacheKey = () => 'walk-' + o.key;
  return material;
}
