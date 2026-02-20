import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  FileText, 
  Loader2, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Moon, 
  Sun, 
  Layout, 
  Type as TypeIcon, 
  Image as ImageIcon, 
  BarChart, 
  Clipboard,
  Scissors,
  Settings,
  Palette,
  Megaphone,
  Edit3,
  RefreshCw,
  Zap,
  Save,
  Trash2,
  Plus,
  ChevronRight,
  ChevronLeft,
  Search,
  Sparkles,
  Award,
  Target,
  ChevronDown
} from 'lucide-react';
import { 
  generateOutline, 
  generateChapterContent, 
  generateImage, 
  generateChartData, 
  refineText, 
  generateMarketingAssets,
  generateFAQ,
  EbookOutline 
} from '../services/gemini';
import { createPDF, Chapter, PDFOptions, estimatePageCount } from '../services/pdf';

type GenerationState = 'idle' | 'outline' | 'content' | 'pdf' | 'done' | 'error' | 'splitting' | 'refining';
type Tab = 'create' | 'editor' | 'design' | 'marketing' | 'history';

const EBOOK_TYPES = [
  "Business", "Marketing digital", "E-commerce", "Formation", 
  "Éducatif", "Scientifique", "Développement personnel", 
  "IA & Technologie", "Storytelling"
];

const IMAGE_STYLES = [
  "Business", "Réel", "Minimaliste", "3D", "Infographie", "Artistique"
];

const COLOR_PALETTES = [
  { name: "Indigo Modern", primary: "#4f46e5" },
  { name: "Emerald Growth", primary: "#059669" },
  { name: "Rose Premium", primary: "#e11d48" },
  { name: "Slate Professional", primary: "#334155" },
  { name: "Amber Creative", primary: "#d97706" }
];

const PAGE_PRESETS = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200];

export default function EbookGenerator() {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [topic, setTopic] = useState('');
  const [ebookType, setEbookType] = useState(EBOOK_TYPES[0]);
  const [imageStyle, setImageStyle] = useState(IMAGE_STYLES[0]);
  const [isPrototype, setIsPrototype] = useState(true);
  const [targetPages, setTargetPages] = useState(10);
  const [customPages, setCustomPages] = useState('');
  const [state, setState] = useState<GenerationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Design Options
  const [pdfOptions, setPdfOptions] = useState<PDFOptions>({
    primaryColor: COLOR_PALETTES[0].primary,
    font: "helvetica",
    headerText: "EbookAI SaaS Premium",
    footerText: "Confidentiel - 2026",
    watermark: "",
    quality: "high",
    noCompression: true
  });

  // Progress tracking
  const [outline, setOutline] = useState<EbookOutline | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [generatedChapters, setGeneratedChapters] = useState<Chapter[]>([]);
  const [marketingAssets, setMarketingAssets] = useState<any>(null);
  const [estimatedPages, setEstimatedPages] = useState(0);
  const [fileSizeMB, setFileSizeMB] = useState(0);

  // History
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('ebook_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    
    const savedTheme = localStorage.getItem('ebook_theme');
    if (savedTheme === 'dark') setIsDarkMode(true);

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem('ebook_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('ebook_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const handleGenerate = async () => {
    const finalTarget = customPages ? parseInt(customPages) : targetPages;
    
    if (!topic.trim()) return;
    if (finalTarget < 10 || finalTarget > 200) {
      setError("Le nombre de pages doit être compris entre 10 et 200.");
      return;
    }
    
    setState('outline');
    setError(null);
    setOutline(null);
    setGeneratedChapters([]);
    setCurrentChapterIndex(0);
    setMarketingAssets(null);
    setEstimatedPages(0);
    setFileSizeMB(0);

    try {
      const generatedOutline = await generateOutline(topic, ebookType, finalTarget, isPrototype);
      setOutline(generatedOutline);
      
      setState('content');
      const chapters: Chapter[] = [];
      const pagesPerChapter = Math.ceil(finalTarget / generatedOutline.chapters.length);
      
      for (let i = 0; i < generatedOutline.chapters.length; i++) {
        setCurrentChapterIndex(i);
        const chapterOutline = generatedOutline.chapters[i];
        const sectionTitles = chapterOutline.sections.map(s => s.title);
        
        let content = await generateChapterContent(
          generatedOutline.title,
          chapterOutline.title,
          sectionTitles,
          pagesPerChapter,
          isPrototype
        );

        // Strict page count verification
        let currentEstimated = estimatePageCount([...chapters, { title: chapterOutline.title, content }], pdfOptions);
        while (!isPrototype && currentEstimated < (i + 1) * pagesPerChapter && content.length < 15000) {
          const moreContent = await refineText(content, 'enrich');
          content = moreContent;
          currentEstimated = estimatePageCount([...chapters, { title: chapterOutline.title, content }], pdfOptions);
        }

        let image: string | undefined;
        if (i % (isPrototype ? 1 : 3) === 0) {
          try {
            image = await generateImage(chapterOutline.title, imageStyle);
          } catch (e) {}
        }

        chapters.push({ title: chapterOutline.title, content, image });
        setGeneratedChapters([...chapters]);
        setEstimatedPages(estimatePageCount(chapters, pdfOptions));
      }

      setState('pdf');
      generateMarketingAssets(topic, generatedOutline.title).then(setMarketingAssets);
      
      const pdfBlob = await createPDF(generatedOutline.title, chapters, pdfOptions);
      setFileSizeMB(pdfBlob.size / (1024 * 1024));
      
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${generatedOutline.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      link.click();
      
      const newEntry = {
        id: Date.now(),
        title: generatedOutline.title,
        chapters,
        date: new Date().toLocaleDateString(),
        pages: finalTarget
      };
      setHistory([newEntry, ...history]);
      
      setState('done');
      setActiveTab('editor');
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
      setState('error');
    }
  };

  const handleDownload = async () => {
    if (!outline) return;
    setState('pdf');
    const pdfBlob = await createPDF(outline.title, generatedChapters, pdfOptions);
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${outline.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    link.click();
    setState('done');
  };

  const handleRefine = async (index: number, action: any) => {
    setState('refining');
    try {
      const refined = await refineText(generatedChapters[index].content, action);
      const newChapters = [...generatedChapters];
      newChapters[index].content = refined;
      setGeneratedChapters(newChapters);
    } catch (e) {}
    setState('done');
  };

  const addFAQ = async (index: number) => {
    setState('refining');
    try {
      const faq = await generateFAQ(generatedChapters[index].content);
      const newChapters = [...generatedChapters];
      newChapters[index].content += "\n\n### Foire Aux Questions\n" + faq;
      setGeneratedChapters(newChapters);
    } catch (e) {}
    setState('done');
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-20 lg:w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 z-50 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl shrink-0">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight hidden lg:block">EbookAI Pro</h1>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <NavItem active={activeTab === 'create'} icon={<Plus />} label="Créer" onClick={() => setActiveTab('create')} />
          <NavItem active={activeTab === 'editor'} icon={<Edit3 />} label="Éditeur" onClick={() => setActiveTab('editor')} disabled={generatedChapters.length === 0} />
          <NavItem active={activeTab === 'design'} icon={<Palette />} label="Design" onClick={() => setActiveTab('design')} />
          <NavItem active={activeTab === 'marketing'} icon={<Megaphone />} label="Marketing" onClick={() => setActiveTab('marketing')} disabled={!marketingAssets} />
          <NavItem active={activeTab === 'history'} icon={<Save />} label="Historique" onClick={() => setActiveTab('history')} />
        </nav>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="hidden lg:block">{isDarkMode ? 'Mode Clair' : 'Mode Sombre'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pl-20 lg:pl-64 min-h-screen">
        <div className="max-w-6xl mx-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'create' && (
              <motion.div key="create" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                <header>
                  <h2 className="text-3xl font-bold mb-2">Nouvel Ebook</h2>
                  <p className="text-zinc-500">Transformez vos idées en livres professionnels de 50+ pages.</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium mb-2">Sujet ou Idée</label>
                          <textarea
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="Ex: Comment devenir un expert en IA générative en 2026..."
                            className="w-full h-32 px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                          />
                        </div>

                        <div className="space-y-4 relative" ref={dropdownRef}>
                          <label className="block text-sm font-medium">Configuration de la pagination</label>
                          
                          <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            disabled={state !== 'idle' && state !== 'done' && state !== 'error'}
                            className="w-full flex items-center justify-between px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl hover:border-indigo-500 transition-all group"
                          >
                            <span className="font-medium">
                              {customPages 
                                ? `${customPages} pages sélectionnées (Personnalisé)` 
                                : `${targetPages} pages sélectionnées`}
                            </span>
                            <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>

                          <AnimatePresence>
                            {isDropdownOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[60] overflow-hidden"
                              >
                                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {PAGE_PRESETS.map(p => (
                                    <button
                                      key={p}
                                      onClick={() => {
                                        setTargetPages(p);
                                        setCustomPages('');
                                        setIsDropdownOpen(false);
                                        setError(null);
                                      }}
                                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                                        targetPages === p && !customPages 
                                          ? 'bg-indigo-600 text-white border-indigo-600' 
                                          : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-100 dark:border-zinc-700 hover:border-indigo-300'
                                      }`}
                                    >
                                      {p} pages
                                    </button>
                                  ))}
                                </div>
                                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800">
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium whitespace-nowrap">Personnalisé :</span>
                                    <input 
                                      type="number" 
                                      value={customPages}
                                      onChange={(e) => {
                                        setCustomPages(e.target.value);
                                        setError(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') setIsDropdownOpen(false);
                                      }}
                                      placeholder="Ex: 47"
                                      className="flex-1 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <button 
                                      onClick={() => setIsDropdownOpen(false)}
                                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold"
                                    >
                                      OK
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-zinc-400 mt-2">Entre 10 et 200 pages maximum.</p>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Type de contenu</label>
                            <select value={ebookType} onChange={(e) => setEbookType(e.target.value)} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl">
                              {EBOOK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Style des images</label>
                            <select value={imageStyle} onChange={(e) => setImageStyle(e.target.value)} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl">
                              {IMAGE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                          <div className="flex items-center gap-3">
                            <Zap className="w-5 h-5 text-indigo-600" />
                            <div>
                              <p className="font-medium text-indigo-900 dark:text-indigo-300">Mode Prototype</p>
                              <p className="text-xs text-indigo-700 dark:text-indigo-400">Génération ultra-rapide pour tester l'idée.</p>
                            </div>
                          </div>
                          <input type="checkbox" checked={isPrototype} onChange={(e) => setIsPrototype(e.target.checked)} className="w-6 h-6 rounded-lg text-indigo-600" />
                        </div>

                        <button
                          onClick={handleGenerate}
                          disabled={!topic.trim() || state === 'outline' || state === 'content'}
                          className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-2xl font-bold text-lg transition-all shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-3"
                        >
                          {state === 'outline' || state === 'content' ? <Loader2 className="animate-spin" /> : <Sparkles className="w-6 h-6" />}
                          {state === 'outline' || state === 'content' ? 'Génération en cours...' : 'Générer mon Ebook Pro'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800">
                      <h3 className="font-bold mb-4 flex items-center gap-2"><Award className="w-5 h-5 text-amber-500" /> Avantages SaaS Pro</h3>
                      <ul className="space-y-3 text-sm text-zinc-500">
                        <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Recherche web en temps réel (2026)</li>
                        <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Illustrations IA haute résolution</li>
                        <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Mise en page automatique intelligente</li>
                        <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Outils marketing KDP & SEO inclus</li>
                      </ul>
                    </div>

                    {state !== 'idle' && (
                      <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-6">
                        <h3 className="font-bold">Progression Réelle</h3>
                        <div className="space-y-4">
                          <ProgressStep title="Planification" active={state === 'outline'} done={state !== 'outline' && state !== 'idle'} />
                          <ProgressStep title="Rédaction" active={state === 'content'} done={state === 'pdf' || state === 'done'} />
                          <ProgressStep title="Finalisation PDF" active={state === 'pdf'} done={state === 'done'} />
                        </div>
                        
                        {(state === 'content' || state === 'pdf' || state === 'done') && (
                          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500">Pages générées</span>
                              <span className="font-bold text-indigo-600">{estimatedPages} / {customPages || targetPages}</span>
                            </div>
                            <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-indigo-600 h-full transition-all duration-500" 
                                style={{ width: `${Math.min(100, (estimatedPages / (parseInt(customPages) || targetPages)) * 100)}%` }}
                              />
                            </div>
                            {fileSizeMB > 0 && (
                              <div className="flex justify-between text-[10px] text-zinc-400">
                                <span>Taille estimée</span>
                                <span>{fileSizeMB.toFixed(2)} MB</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'editor' && (
              <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Éditeur Avancé</h2>
                  <button onClick={() => createPDF(outline?.title || "Ebook", generatedChapters, pdfOptions)} className="px-6 py-2 bg-indigo-600 text-white rounded-xl flex items-center gap-2">
                    <Download className="w-4 h-4" /> Exporter PDF
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                  <div className="lg:col-span-1 space-y-2 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    {generatedChapters.map((ch, i) => (
                      <button 
                        key={i} 
                        onClick={() => setCurrentChapterIndex(i)}
                        className={`w-full p-4 text-left rounded-2xl transition-all border ${
                          currentChapterIndex === i ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-300' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'
                        }`}
                      >
                        <p className="text-xs font-bold opacity-50 mb-1 uppercase tracking-wider">Chapitre {i + 1}</p>
                        <p className="font-medium truncate">{ch.title}</p>
                      </button>
                    ))}
                  </div>

                  <div className="lg:col-span-3 space-y-6">
                    <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 min-h-[60vh]">
                      <div className="flex justify-between items-center mb-8">
                        <h3 className="text-2xl font-bold">{generatedChapters[currentChapterIndex].title}</h3>
                        <div className="flex gap-2">
                          <button onClick={() => handleRefine(currentChapterIndex, 'rewrite')} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg" title="Réécrire"><RefreshCw className="w-5 h-5" /></button>
                          <button onClick={() => handleRefine(currentChapterIndex, 'simplify')} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg" title="Simplifier"><Scissors className="w-5 h-5" /></button>
                          <button onClick={() => addFAQ(currentChapterIndex)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg" title="Ajouter FAQ"><Plus className="w-5 h-5" /></button>
                        </div>
                      </div>

                      {generatedChapters[currentChapterIndex].image && (
                        <img src={generatedChapters[currentChapterIndex].image} className="w-full h-64 object-cover rounded-2xl mb-8 border border-zinc-200 dark:border-zinc-800" />
                      )}

                      <textarea
                        value={generatedChapters[currentChapterIndex].content}
                        onChange={(e) => {
                          const newChapters = [...generatedChapters];
                          newChapters[currentChapterIndex].content = e.target.value;
                          setGeneratedChapters(newChapters);
                        }}
                        className="w-full h-[50vh] bg-transparent border-none focus:ring-0 text-lg leading-relaxed resize-none custom-scrollbar"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'design' && (
              <motion.div key="design" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <h2 className="text-3xl font-bold">Design & Identité Visuelle</h2>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium mb-2">Qualité d'export</label>
                        <select 
                          value={pdfOptions.quality} 
                          onChange={(e) => setPdfOptions({...pdfOptions, quality: e.target.value as any})}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl"
                        >
                          <option value="standard">Standard (72 DPI)</option>
                          <option value="high">Haute (150 DPI)</option>
                          <option value="ultra">Ultra (300 DPI - Impression)</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer mb-3">
                          <input 
                            type="checkbox" 
                            checked={pdfOptions.noCompression} 
                            onChange={(e) => setPdfOptions({...pdfOptions, noCompression: e.target.checked})}
                            className="w-5 h-5 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Désactiver la compression</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-4">Palette de couleurs</label>
                      <div className="grid grid-cols-3 gap-4">
                        {COLOR_PALETTES.map(p => (
                          <button 
                            key={p.name} 
                            onClick={() => setPdfOptions({...pdfOptions, primaryColor: p.primary})}
                            className={`p-4 rounded-2xl border-2 transition-all ${pdfOptions.primaryColor === p.primary ? 'border-indigo-600' : 'border-transparent bg-zinc-50 dark:bg-zinc-800'}`}
                          >
                            <div className="w-full h-8 rounded-lg mb-2" style={{ backgroundColor: p.primary }} />
                            <p className="text-xs font-medium">{p.name}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium mb-2">Police de caractères</label>
                        <select 
                          value={pdfOptions.font} 
                          onChange={(e) => setPdfOptions({...pdfOptions, font: e.target.value as any})}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl"
                        >
                          <option value="helvetica">Helvetica (Moderne)</option>
                          <option value="times">Times (Classique)</option>
                          <option value="courier">Courier (Technique)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Filigrane (Watermark)</label>
                        <input 
                          type="text" 
                          value={pdfOptions.watermark} 
                          onChange={(e) => setPdfOptions({...pdfOptions, watermark: e.target.value})}
                          placeholder="Ex: CONFIDENTIEL"
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">En-tête personnalisé</label>
                        <input type="text" value={pdfOptions.headerText} onChange={(e) => setPdfOptions({...pdfOptions, headerText: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Pied de page personnalisé</label>
                        <input type="text" value={pdfOptions.footerText} onChange={(e) => setPdfOptions({...pdfOptions, footerText: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-center">
                    <div className="w-64 h-80 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl relative overflow-hidden p-8 flex flex-col justify-between">
                      <div className="w-12 h-12 bg-indigo-600 rounded-lg mx-auto" />
                      <div className="space-y-2">
                        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full" style={{ backgroundColor: pdfOptions.primaryColor + '40' }} />
                        <div className="h-8 bg-zinc-300 dark:bg-zinc-600 rounded w-3/4 mx-auto" style={{ backgroundColor: pdfOptions.primaryColor }} />
                        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2 mx-auto" />
                      </div>
                      <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded w-1/4 mx-auto" />
                    </div>
                    <p className="mt-8 text-zinc-500">Aperçu de la couverture</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'marketing' && marketingAssets && (
              <motion.div key="marketing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <h2 className="text-3xl font-bold">Outils Marketing & Vente</h2>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-6">
                    <h3 className="font-bold flex items-center gap-2"><Target className="w-5 h-5 text-indigo-600" /> Amazon KDP & SEO</h3>
                    <div>
                      <label className="block text-sm font-medium mb-2">Description KDP</label>
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">{marketingAssets.kdpDescription}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Mots-clés SEO</label>
                      <div className="flex flex-wrap gap-2">
                        {marketingAssets.seoKeywords.map((k: string) => <span key={k} className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-full text-xs font-medium">{k}</span>)}
                      </div>
                    </div>
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Prix de vente conseillé : {marketingAssets.suggestedPrice}</p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-6">
                    <h3 className="font-bold flex items-center gap-2"><Megaphone className="w-5 h-5 text-indigo-600" /> Lancement & Promotion</h3>
                    <div>
                      <label className="block text-sm font-medium mb-2">Email de lancement</label>
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">{marketingAssets.marketingEmail}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Plan Page de Vente</label>
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">{marketingAssets.salesPage}</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <h2 className="text-3xl font-bold">Historique des Projets</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {history.map(item => (
                    <div key={item.id} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 group hover:border-indigo-500 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><FileText className="w-5 h-5" /></div>
                        <button onClick={() => setHistory(history.filter(h => h.id !== item.id))} className="p-2 text-zinc-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <h3 className="font-bold mb-1 truncate">{item.title}</h3>
                      <p className="text-xs text-zinc-500 mb-4">{item.date} • {item.chapters.length} chapitres</p>
                      <button 
                        onClick={() => {
                          setGeneratedChapters(item.chapters);
                          setOutline({ title: item.title, chapters: item.chapters.map((c: any) => ({ title: c.title, sections: [] })) });
                          setActiveTab('editor');
                        }}
                        className="w-full py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-600 hover:text-white rounded-xl text-sm font-medium transition-all"
                      >
                        Ouvrir dans l'éditeur
                      </button>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="col-span-full py-20 text-center text-zinc-400">
                      <Save className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>Aucun projet enregistré pour le moment.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Global Loader Overlay */}
      {state === 'refining' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="font-bold">Optimisation par l'IA...</p>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ active, icon, label, onClick, disabled = false }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void, disabled?: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`w-full p-3 lg:p-4 rounded-2xl flex items-center gap-4 transition-all ${
        active 
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' 
          : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="hidden lg:block font-medium">{label}</span>
    </button>
  );
}

function ProgressStep({ title, active, done }: { title: string, active: boolean, done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
        done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 text-white animate-pulse' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : null}
      </div>
      <span className={`text-sm ${active ? 'font-bold text-indigo-600' : done ? 'text-emerald-600' : 'text-zinc-400'}`}>{title}</span>
    </div>
  );
}
