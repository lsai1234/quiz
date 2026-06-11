'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export function BottleScene() {
  const mountRef = useRef<HTMLDivElement>(null)

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(3, 5, 3)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xb0c8ff, 0.4)
    fill.position.set(-4, 2, -2)
    scene.add(fill)
    const accent = new THREE.PointLight(0x00D4FF, 1.5, 8)
    accent.position.set(0, -3, 2)
    scene.add(accent)

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x111111, metalness: 0.85, roughness: 0.15, reflectivity: 0.9,
    })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 2.6, 48), bodyMat)
    scene.add(body)

    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.4, 48), bodyMat)
    shoulder.position.y = 1.5
    scene.add(shoulder)

    const labelMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1a1a, metalness: 0.2, roughness: 0.7,
      emissive: new THREE.Color(0x00D4FF), emissiveIntensity: 0.06,
    })
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 1.4, 48), labelMat)
    scene.add(label)

    let raf = 0
    let rot = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
      rot += 0.003
      body.rotation.y = rot
      shoulder.rotation.y = rot
      label.rotation.y = rot
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
