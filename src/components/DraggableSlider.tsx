import { useRef, useEffect, useState } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'

interface DraggableSliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export default function DraggableSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
}: DraggableSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const x = useMotionValue(0)
  
  useEffect(() => {
    if (trackRef.current) {
      setTrackWidth(trackRef.current.offsetWidth)
    }
    const handleResize = () => {
      if (trackRef.current) {
        setTrackWidth(trackRef.current.offsetWidth)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const valueTransform = useTransform(x, [0, trackWidth], [min, max])

  useEffect(() => {
    const unsubscribe = valueTransform.on("change", (latest) => {
      onChange(latest)
    })
    return () => unsubscribe()
  }, [valueTransform, onChange])
  
  useEffect(() => {
    if (trackWidth > 0) {
      const newX = ((value - min) / (max - min)) * trackWidth
      x.set(newX)
    }
  }, [value, min, max, x, trackWidth])

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-[11px] font-bold text-white/40 uppercase tracking-widest">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-6 flex items-center group cursor-grab active:cursor-grabbing"
      >
        <div className="absolute w-full bg-white/5 rounded-full h-1" />
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-white/40 rounded-full"
          style={{ width: x }}
        />
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: trackWidth }}
          dragElastic={0}
          dragMomentum={false}
          className="relative h-5 w-5 bg-white rounded-full shadow-lg cursor-pointer z-10 group-hover:scale-110 transition-transform"
          style={{ x }}
        />
      </div>
    </div>
  )
}