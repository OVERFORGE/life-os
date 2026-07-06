"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Camera, RefreshCcw, ImageIcon, Dna, Activity, X, ArrowLeft 
} from 'lucide-react';
import Image from 'next/image';

export default function NutritionScanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editFoodParam = searchParams.get('editFood');
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editModeId, setEditModeId] = useState<string | null>(null);

  const [results, setResults] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editFoodParam) {
      try {
        const item = JSON.parse(decodeURIComponent(editFoodParam));
        setEditModeId(item._id);
        if (item.imageUrl) setImageUri(item.imageUrl);
        setResults({
          name: item.name,
          baseWeight: item.baseWeight || 100,
          macros: item.macros || { calories: 0, protein: 0, carbs: 0, fats: 0 },
          micros: item.micros || { zinc: 0, magnesium: 0, vitaminC: 0, vitaminB: 0, iron: 0, calcium: 0 }
        });
      } catch (e) {
        console.error("Failed parsing edit item", e);
      }
    }
  }, [editFoodParam]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImageUri(base64String);
        // Remove the data:image/jpeg;base64, prefix for the API if needed, 
        // but let's keep it just in case the API handles it, or strip it here.
        const base64Data = base64String.split(',')[1];
        setBase64Image(base64Data);
        setResults(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeFood = async () => {
    if (!base64Image) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/nutrition/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image, description }),
      });

      const textOutput = await response.text();
      let data;
      try {
        data = JSON.parse(textOutput);
      } catch (err) {
        throw new Error(`Server returned non-JSON.`);
      }

      if (!response.ok) throw new Error(data.error || 'Analysis failed');

      setResults(data);
    } catch (error: any) {
      console.error(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveToLibrary = async () => {
    if (!results) return;
    setIsSaving(true);
    try {
      const payload = {
        name: results.name,
        baseWeight: results.baseWeight,
        imageUrl: imageUri || results.imageUrl, // In a real app, this should be uploaded to a CDN
        macros: results.macros,
        micros: results.micros,
        components: results.components || []
      };

      const endpoint = editModeId ? `/api/nutrition/library/${editModeId}` : '/api/nutrition/library';
      const method = editModeId ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save');
      }

      router.back();
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateMacro = (key: string, value: string) => {
    setResults({ ...results, macros: { ...results.macros, [key]: Number(value) || 0 } });
  };
  const updateMicro = (key: string, value: string) => {
    setResults({ ...results, micros: { ...results.micros, [key]: Number(value) || 0 } });
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-4xl mx-auto w-full relative">
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={cameraInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />

      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
        >
          <ArrowLeft className="text-gray-400" size={18} />
        </button>
        <h1 className="text-2xl font-black text-gray-100 tracking-tight">
          {editModeId ? "Edit Food" : "AI Scanner"}
        </h1>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">
        <p className="text-gray-500 text-sm font-semibold text-center mb-8">
          {editModeId ? "Modify specific metrics for this food item." : "Scan any food to get precision macro detection."}
        </p>

        {!imageUri ? (
          <div className="max-w-md mx-auto w-full">
            <button 
              onClick={() => cameraInputRef.current?.click()}
              className="w-full bg-gray-100 hover:bg-white text-[#161618] rounded-3xl p-8 flex items-center justify-center mb-4 transition-colors shadow-lg"
            >
              <Camera size={24} className="mr-4" />
              <span className="text-xl font-black uppercase tracking-widest">Open Camera</span>
            </button>

            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] text-gray-400 rounded-3xl p-6 flex items-center justify-center transition-colors"
            >
              <ImageIcon size={20} className="mr-3" />
              <span className="text-sm font-bold uppercase tracking-widest">Upload from Gallery</span>
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto w-full">
            <div className="relative rounded-3xl overflow-hidden h-[300px] md:h-[400px] border border-[#2A2B2F] bg-[#161618]">
              <Image src={imageUri} alt="Food Scan" fill className="object-cover" />
              {!results && (
                <button 
                  onClick={() => setImageUri(null)}
                  className="absolute top-4 right-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 flex items-center hover:bg-black/60 transition-colors"
                >
                  <RefreshCcw className="text-white mr-2" size={14} />
                  <span className="text-white text-xs font-black uppercase tracking-widest">Retake</span>
                </button>
              )}
            </div>

            {!results && (
              <div className="mt-8 bg-[#1F2023] p-6 md:p-8 rounded-3xl border border-[#2A2B2F]">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3">Context (Optional)</div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Cooked with 1 tbsp olive oil"
                  className="w-full bg-[#161618] text-gray-100 text-sm p-4 rounded-2xl border border-[#2A2B2F] focus:border-[#3A3C42] focus:outline-none min-h-[96px] resize-none mb-6 placeholder:text-gray-600"
                />
                
                <button 
                  onClick={analyzeFood} 
                  disabled={isAnalyzing}
                  className="w-full py-4 rounded-2xl flex items-center justify-center bg-gray-100 hover:bg-white text-[#161618] font-black text-sm uppercase tracking-widest transition-colors shadow-lg disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <div className="w-5 h-5 border-2 border-[#161618] border-t-transparent rounded-full animate-spin" />
                  ) : 'Analyze Food Data'}
                </button>
              </div>
            )}
          </div>
        )}

        {results && (
          <div className="mt-8 max-w-2xl mx-auto w-full bg-[#1F2023] p-6 md:p-8 rounded-3xl border border-[#E8414A]/30 shadow-[0_0_40px_-15px_rgba(232,65,74,0.3)]">
            <div className="text-[10px] font-bold text-[#E8414A] uppercase tracking-[0.2em] mb-6 text-center">Verification Override</div>
            
            <input 
              type="text"
              value={results.name}
              onChange={(e) => setResults({...results, name: e.target.value})}
              className="w-full bg-[#161618] text-gray-100 text-2xl font-black p-4 rounded-2xl text-center mb-8 border border-[#2A2B2F] focus:border-[#3A3C42] focus:outline-none"
            />

            <div className="flex items-center mb-4 ml-2">
              <Activity size={16} className="text-[#E8414A]" />
              <span className="text-gray-400 text-xs font-black tracking-widest uppercase ml-2">Macros</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              {[
                { label: 'Calories', key: 'calories', suffix: 'KCAL' },
                { label: 'Protein', key: 'protein', suffix: 'g' },
                { label: 'Carbs', key: 'carbs', suffix: 'g' },
                { label: 'Fats', key: 'fats', suffix: 'g' }
              ].map((item) => (
                <div key={item.key} className="bg-[#161618] p-4 rounded-2xl border border-[#2A2B2F]">
                  <div className="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-2">{item.label}</div>
                  <div className="flex items-end border-b border-[#2A2B2F] pb-1">
                    <input 
                      type="number"
                      value={results.macros?.[item.key] || 0}
                      onChange={(e) => updateMacro(item.key, e.target.value)}
                      className="bg-transparent text-gray-100 text-2xl font-black w-full min-w-[40px] focus:outline-none"
                    />
                    <span className="text-gray-500 text-xs font-black ml-1 mb-1">{item.suffix}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center mb-4 ml-2 mt-4">
              <Dna size={16} className="text-[#E8414A]" />
              <span className="text-gray-400 text-xs font-black tracking-widest uppercase ml-2">Micros</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Zinc', key: 'zinc' },
                { label: 'Magnesium', key: 'magnesium' },
                { label: 'Vitamin C', key: 'vitaminC' },
                { label: 'Vitamin B', key: 'vitaminB' },
                { label: 'Iron', key: 'iron' },
                { label: 'Calcium', key: 'calcium' }
              ].map((item) => (
                <div key={item.key} className="bg-[#161618] p-3 rounded-xl border border-[#2A2B2F]">
                  <div className="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-2">{item.label}</div>
                  <div className="flex items-end border-b border-[#2A2B2F] pb-1">
                    <input 
                      type="number"
                      value={results.micros?.[item.key] || 0}
                      onChange={(e) => updateMicro(item.key, e.target.value)}
                      className="bg-transparent text-gray-100 text-lg font-black w-full min-w-[30px] focus:outline-none"
                    />
                    <span className="text-gray-500 text-xs font-black ml-1 mb-0.5">mg</span>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={saveToLibrary} 
              disabled={isSaving}
              className="w-full mt-10 py-4 rounded-2xl flex items-center justify-center bg-gray-100 hover:bg-white text-[#161618] font-black text-sm uppercase tracking-widest transition-colors shadow-lg disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-[#161618] border-t-transparent rounded-full animate-spin" />
              ) : 'Save to Library'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
