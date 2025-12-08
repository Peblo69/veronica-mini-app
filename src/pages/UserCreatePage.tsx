import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { User } from '../lib/api';
import type { MediaFile } from '../types';
import { useDropzone } from 'react-dropzone';
import { Image as ImageIcon, Video as VideoIcon, PlusCircle, Sliders } from 'lucide-react';
import DraggableSlider from '../components/DraggableSlider';

type Step = 'upload' | 'edit' | 'details';

interface UserCreatePageProps {
  user: User;
}

export default function UserCreatePage({ user: _user }: UserCreatePageProps) {
  const [step, setStep] = useState<Step>('upload');
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [, _setContent] = useState('');
  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    sepia: 0,
    grayscale: 0,
    invert: 0,
    'hue-rotate': 0,
  });

  const handleFilterChange = (filterName: keyof typeof filters, value: number) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const type = file.type.startsWith('image/') ? 'image' : 'video';
      if (type === 'image' || type === 'video') {
        setMediaFile({
          file,
          preview: URL.createObjectURL(file),
          type,
          filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, sepia: 0, grayscale: 0, invert: 0, 'hue-rotate': 0 }
        });
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi', '.webm']
    },
    multiple: false,
  });

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden flex flex-col font-sans">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-end p-4">
        {mediaFile && step === 'upload' && (
          <motion.button 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setStep('edit')} 
            className="font-bold text-white py-2 px-5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            Next
          </motion.button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {step === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 flex items-center justify-center p-8"
          >
            <div
              {...getRootProps()}
              className={`w-full max-w-md aspect-square rounded-3xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 overflow-hidden
                ${isDragActive ? 'bg-white/10 border-white/50 scale-105' : 'hover:bg-white/5 hover:border-white/30'}
                ${mediaFile ? 'border-solid' : ''}
              `}
            >
              <input {...getInputProps()} />
              {mediaFile ? (
                mediaFile.type === 'image' ? (
                  <img src={mediaFile.preview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <video src={mediaFile.preview} className="w-full h-full object-cover" autoPlay loop muted />
                )
              ) : (
                <>
                  <div className="flex items-center gap-8 mb-4">
                    <ImageIcon className="w-12 h-12 text-white/40" strokeWidth={1.5} />
                    <VideoIcon className="w-12 h-12 text-white/40" strokeWidth={1.5} />
                  </div>
                  <PlusCircle className="w-16 h-16 text-white/50 my-4" strokeWidth={1} />
                  <p className="font-semibold text-white/60 tracking-wide">Add Image or Video</p>
                </>
              )}
            </div>
          </motion.div>
        )}
        {step === 'edit' && mediaFile && (
          <motion.div 
            key="edit"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '-100%' }}
            className="flex-1 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4">
               <button onClick={() => setStep('upload')} className="font-bold text-white py-2 px-4 rounded-full">Back</button>
               <button onClick={() => setStep('details')} className="font-bold text-white py-2 px-5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">Next</button>
            </div>
            
            {/* Main Content */}
            <div className="flex-1 flex">
              {/* Image Preview */}
              <div className="flex-1 flex items-center justify-center bg-black overflow-hidden p-4">
                <img 
                  src={mediaFile.preview} 
                  alt="preview" 
                  className="max-h-full max-w-full object-contain"
                  style={{
                    filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) blur(${filters.blur}px) sepia(${filters.sepia}%) grayscale(${filters.grayscale}%) invert(${filters.invert}%) hue-rotate(${filters['hue-rotate']}deg)`
                  }}
                />
              </div>

              {/* Sidebar */}
              <div className="w-80 bg-gray-900/50 backdrop-blur-sm border-l border-white/10 p-6 overflow-y-auto">
                <div className="flex items-center gap-2 mb-6">
                  <Sliders className="w-5 h-5 text-white" />
                  <h3 className="text-lg font-bold">Adjustments</h3>
                </div>
                <div className="space-y-4">
                  <DraggableSlider label="Brightness" value={filters.brightness} onChange={(v) => handleFilterChange('brightness', v)} min={0} max={200} />
                  <DraggableSlider label="Contrast" value={filters.contrast} onChange={(v) => handleFilterChange('contrast', v)} min={0} max={200} />
                  <DraggableSlider label="Saturation" value={filters.saturation} onChange={(v) => handleFilterChange('saturation', v)} min={0} max={300} />
                  <DraggableSlider label="Blur" value={filters.blur} onChange={(v) => handleFilterChange('blur', v)} min={0} max={20} />
                  <DraggableSlider label="Sepia" value={filters.sepia} onChange={(v) => handleFilterChange('sepia', v)} min={0} max={100} />
                  <DraggableSlider label="Grayscale" value={filters.grayscale} onChange={(v) => handleFilterChange('grayscale', v)} min={0} max={100} />
                  <DraggableSlider label="Invert" value={filters.invert} onChange={(v) => handleFilterChange('invert', v)} min={0} max={100} />
                  <DraggableSlider label="Hue" value={filters['hue-rotate']} onChange={(v) => handleFilterChange('hue-rotate', v)} min={0} max={360} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {step === 'details' && (
          <motion.div key="details">
            {/* TODO: Implement Details Screen */}
            <p>Details Screen</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
