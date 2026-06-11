'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface Props {
  scrollProgress: number
}

const CAPSULE_COLOURS = [0x00D4FF, 0x00AACC, 0x80E8FF, 0xffffff, 0x333333]

export function BottleScene({ scrollProgress }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef(scrollProgress)

  useEffect(() => { scrollRef.current = scrollProgress }, [scrollProgress])

  useEffect(() => {
    if (!mountRef.current) return

    const W = mountRef.current.clientWidth
    const H = mountRef.current.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mountRef.current.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
    camera.position.set(0, 0.5, 6)
    camera.lookAt(0, 0, 0)

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(3, 5, 3)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xb0c8ff, 0.4)
    fill.position.set(-4, 2, -2)
    scene.add(fill)
    const accentLight = new THREE.PointLight(0x00D4FF, 1.5, 8)
    accentLight.position.set(0, -3, 2)
    scene.add(accentLight)

    // Bottle body — dark metallic
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x111111,
      metalness: 0.85,
      roughness: 0.15,
      reflectivity: 0.9,
    })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 2.6, 48), bodyMat)
    scene.add(body)

    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.4, 48), bodyMat)
    shoulder.position.y = 1.5
    scene.add(shoulder)

    // Label band with cyan emissive
    const labelMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1a1a,
      metalness: 0.2,
      roughness: 0.7,
      emissive: new THREE.Color(0x00D4FF),
      emissiveIntensity: 0.06,
    })
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 1.4, 48), labelMat)
    scene.add(label)

    // Lid — cyan, group so we can rotate + translate together
    const lid = new THREE.Group()
    const lidMat = new THREE.MeshPhysicalMaterial({ color: 0x00D4FF, metalness: 0.7, roughness: 0.15 })
    lid.add(new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.55, 48), lidMat))
    const lidCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
      lidMat,
    )
    lidCap.position.y = 0.275
    lid.add(lidCap)
    lid.position.y = 1.98
    scene.add(lid)

    // Capsules
    const capsuleCount = 22
    const capsules: THREE.Mesh[] = []
    const initPos: THREE.Vector3[] = []
    const targets: THREE.Vector3[] = []

    for (let i = 0; i < capsuleCount; i++) {
      const col = CAPSULE_COLOURS[i % CAPSULE_COLOURS.length]
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, 0.22, 4, 10),
        new THREE.MeshPhysicalMaterial({ color: col, metalness: 0.3, roughness: 0.4 }),
      )
      const ix = (Math.random() - 0.5) * 0.3
      const iy = 1.3 + Math.random() * 0.4
      const iz = (Math.random() - 0.5) * 0.3
      mesh.position.set(ix, iy, iz)
      mesh.rotation.z = Math.random() * Math.PI
      initPos.push(new THREE.Vector3(ix, iy, iz))

      const angle = (i / capsuleCount) * Math.PI * 2 + Math.random() * 0.5
      const radius = 1.8 + Math.random() * 1.4
      targets.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        1.3 + (Math.random() - 0.3) * 3.5,
        Math.sin(angle) * radius * 0.6,
      ))
      capsules.push(mesh)
      scene.add(mesh)
    }

    // Render loop — reads scrollRef.current every frame (no React re-renders)
    let raf = 0
    let bodyRot = 0
    let lidTumbleRot = 0
    let time = 0

    const animate = () => {
      raf = requestAnimationFrame(animate)
      const sp = scrollRef.current
      time += 0.016
      bodyRot += 0.003

      body.rotation.y = bodyRot
      shoulder.rotation.y = bodyRot
      label.rotation.y = bodyRot

      // ── UNSCREW PHASE (scroll 0 → 55%) ───────────────────────────────────
      const unscrewP = Math.min(sp / 0.55, 1)

      // ── FALL PHASE (scroll 52% → 82%) ────────────────────────────────────
      const fallRaw = Math.max((sp - 0.52) / 0.30, 0)
      const fallP = Math.min(fallRaw, 1)
      const fallS = fallP * fallP * (3 - 2 * fallP)  // smoothstep

      if (sp < 0.54) {
        // Lid unscrews: Y rotation + slow rise
        lid.rotation.y = bodyRot + unscrewP * Math.PI * 5  // 2.5 full turns
        lid.rotation.z = unscrewP > 0.75 ? Math.sin(time * 7) * 0.06 : 0  // wobble near free
        lid.rotation.x = 0
        lid.position.set(0, 1.98 + unscrewP * 0.55, 0)
        lidTumbleRot = lid.rotation.y  // keep synced for seamless fall transition
      } else {
        // Lid flies off: arc to the side + tumble
        lidTumbleRot += 0.10
        lid.rotation.y = lidTumbleRot
        lid.rotation.z = fallS * 1.2
        lid.rotation.x = fallS * 0.7
        lid.position.x = fallS * 4.5
        lid.position.y = 1.98 + 0.55 - fallS * 7.5
        lid.position.z = fallS * 1.8
      }

      // ── CAPSULE SCATTER (scroll 40% → 100%) ──────────────────────────────
      const scatterP = Math.min(Math.max((sp - 0.40) / 0.60, 0), 1)
      const scatterS = scatterP * scatterP * (3 - 2 * scatterP)

      capsules.forEach((c, i) => {
        c.position.x = THREE.MathUtils.lerp(initPos[i].x, targets[i].x, scatterS)
        c.position.y = THREE.MathUtils.lerp(initPos[i].y, targets[i].y, scatterS)
        c.position.z = THREE.MathUtils.lerp(initPos[i].z, targets[i].z, scatterS)
        c.rotation.y += 0.018 * (1 + scatterP * 2)
      })

      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      if (!mountRef.current) return
      const w = mountRef.current.clientWidth
      const h = mountRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      mountRef.current?.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="w-full h-full" />
}
