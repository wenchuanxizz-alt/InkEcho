/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, Check, X, RotateCcw, Trash2, History, Plus, Languages, Eye, EyeOff, Edit3, Sun, Moon, Calendar as CalendarIcon, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { JournalEntry } from './types';
import { refineTranscript } from './lib/gemini';
import * as Diff from 'diff';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// Speech Recognition setup
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function App() {
  const [isJournalOpened, setIsJournalOpened] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<JournalEntry | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [language, setLanguage] = useState<'en-US' | 'zh-CN' | 'auto'>('auto');
  const [showDiff, setShowDiff] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  // Pagination and Filtering
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [viewingEntry, setViewingEntry] = useState<JournalEntry | null>(null);
  const [isEditingInModal, setIsEditingInModal] = useState(false);
  const [modalEditText, setModalEditText] = useState("");
  const pageSize = 5;
  
  const [isAIConfigured, setIsAIConfigured] = useState(true);
  
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);

  // Load theme and entries from localStorage
  useEffect(() => {
    // Check if AI is configured
    if (!process.env.GEMINI_API_KEY) {
      setIsAIConfigured(false);
    }
    const savedTheme = localStorage.getItem('echo_journal_theme') as 'light' | 'dark';
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }

    const saved = localStorage.getItem('echo_journal_entries');
    if (saved) {
      try {
        setEntries(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved entries', e);
      }
    }
  }, []);

  // Save theme and entries to localStorage
  useEffect(() => {
    localStorage.setItem('echo_journal_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('echo_journal_entries', JSON.stringify(entries));
  }, [entries]);

  const startRecording = () => {
    if (!SpeechRecognition) {
      alert('此浏览器不支持语音识别。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // 'zh-CN' is generally more robust for mixed Chinese/English speech in Chrome's STT
    recognition.lang = language === 'auto' ? 'zh-CN' : language;

    recognition.onstart = () => {
      setIsRecording(true);
      isRecordingRef.current = true;
      setTranscript('');
      setCurrentEntry(null);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      // We want to show the full current state of the transcription
      // SpeechRecognition results are cumulative for the session
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        fullTranscript += event.results[i][0].transcript;
      }
      setTranscript(fullTranscript);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // 'no-speech' is a common timeout error, we can ignore it or handle it silently
        return;
      }
      console.error('Speech recognition error', event.error);
      stopRecording();
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
        // If we're still supposed to be recording, restart it
        // This handles timeouts like 'no-speech'
        try {
          recognition.start();
        } catch (e) {
          console.error("Failed to restart recognition", e);
          setIsRecording(false);
          isRecordingRef.current = false;
        }
      } else {
        setIsRecording(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    if (transcript.trim()) {
      handleRefine(transcript);
    }
  };

  const handleRefine = async (text: string) => {
    setIsRefining(true);
    const refined = await refineTranscript(text);
    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      rawTranscript: text,
      refinedText: refined,
      status: 'refined'
    };
    setCurrentEntry(newEntry);
    setIsRefining(false);
  };

  const acceptRefined = () => {
    if (currentEntry) {
      const entry = { ...currentEntry, status: 'accepted' as const };
      setEntries([entry, ...entries]);
      setCurrentEntry(null);
      setTranscript('');
    }
  };

  const keepOriginal = () => {
    if (currentEntry) {
      const entry = { ...currentEntry, status: 'original' as const };
      setEntries([entry, ...entries]);
      setCurrentEntry(null);
      setTranscript('');
    }
  };

  const discardEntry = () => {
    setCurrentEntry(null);
    setTranscript('');
  };

  const deleteEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
    // Reset to page 1 if current page becomes empty
    const remaining = entries.filter(e => e.id !== id).length;
    if (Math.ceil(remaining / pageSize) < currentPage && currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const filteredEntries = entries.filter(entry => {
    if (!selectedDate) return true;
    return isSameDay(new Date(entry.timestamp), selectedDate);
  });

  const totalPages = Math.ceil(filteredEntries.length / pageSize);
  const paginatedEntries = filteredEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const entriesByDate = entries.reduce((acc, entry) => {
    const dateKey = format(new Date(entry.timestamp), 'yyyy-MM-dd');
    acc[dateKey] = (acc[dateKey] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const updateEntryText = (id: string, newText: string) => {
    setEntries(entries.map(e => {
      if (e.id === id) {
        return { ...e, refinedText: newText, status: 'accepted' as const };
      }
      return e;
    }));
  };

  const renderDiff = (oldText: string, newText: string) => {
    const diff = language === 'zh-CN' ? Diff.diffChars(oldText, newText) : Diff.diffWords(oldText, newText);
    return (
      <span className="leading-relaxed">
        {diff.map((part, index) => {
          if (part.added) {
            return <span key={index} className="text-green-800 dark:text-green-400 bg-green-500/10 px-0.5 rounded-sm">{part.value}</span>;
          }
          if (part.removed) {
            return (
              <span key={index} className="text-red-800/40 dark:text-red-400/40 line-through decoration-red-800/30 dark:decoration-red-400/30 px-0.5">
                {part.value}
              </span>
            );
          }
          return <span key={index}>{part.value}</span>;
        })}
      </span>
    );
  };

  const handleOpenJournal = () => {
    setIsOpening(true);
    setTimeout(() => {
      setIsJournalOpened(true);
      setIsOpening(false);
    }, 1000); // Much faster transition
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''} bg-[#F5F5F0] dark:bg-[#0F0F0F] text-[#1A1A1A] dark:text-[#E8E8E0] font-serif selection:bg-[#5A5A40]/20 transition-colors duration-500`}>
      <AnimatePresence mode="wait">
        {!isJournalOpened ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)' }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#F5F5F0] dark:bg-[#0F0F0F] overflow-hidden"
          >
            {/* Background Texture for Intro */}
            <div className="absolute inset-0 opacity-[0.4] pointer-events-none" 
                 style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/handmade-paper.png")' }} />
            
            <div className="relative group">
              {/* Hand-drawn Speech Bubble - Pointing towards the notebook */}
              <div className="absolute -right-56 top-1/2 -translate-y-1/2 pointer-events-none z-30">
                <div className="flex flex-col items-center">
                  <div className="relative flex items-center justify-center">
                    {/* Hand-drawn Bubble SVG (Animated Pencil Drawing) */}
                    <svg width="220" height="160" viewBox="0 0 220 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute text-black opacity-80">
                      <defs>
                        <filter id="pencil-sketch-v3">
                          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" result="noise" />
                          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" />
                        </filter>
                      </defs>
                      
                      {/* Main Bubble Path - Looping Animation */}
                      <motion.path 
                        d="M15 70 C 15 20, 205 20, 205 70 C 205 120, 60 130, 45 150 C 50 130, 15 120, 15 70" 
                        stroke="currentColor" 
                        strokeWidth="3" 
                        strokeLinecap="round" 
                        filter="url(#pencil-sketch-v3)"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ 
                          duration: 1.5, 
                          ease: "linear" 
                        }}
                      />
                      
                      {/* Secondary Sketchy Path */}
                      <motion.path 
                        d="M18 72 C 18 22, 202 22, 202 72 C 202 122, 62 132, 47 152 C 52 132, 18 122, 18 72" 
                        stroke="currentColor" 
                        strokeWidth="1.5" 
                        strokeLinecap="round" 
                        opacity="0.5" 
                        filter="url(#pencil-sketch-v3)"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ 
                          duration: 1.5, 
                          ease: "linear",
                          delay: 0.1
                        }}
                      />
                      
                      {/* Quotation Marks - Also Animated */}
                      <motion.path 
                        d="M40 50 Q 45 45, 45 55 M 52 50 Q 57 45, 57 55" 
                        stroke="currentColor" 
                        strokeWidth="3" 
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ 
                          duration: 0.5, 
                          ease: "easeOut",
                          delay: 1.0
                        }}
                      />
                      <motion.path 
                        d="M165 90 Q 170 85, 170 95 M 177 90 Q 182 85, 182 95" 
                        stroke="currentColor" 
                        strokeWidth="3" 
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ 
                          duration: 0.5, 
                          ease: "easeOut",
                          delay: 1.2
                        }}
                      />
                    </svg>
                    
                    {/* Text inside bubble (Static, always visible) */}
                    <span className="relative z-10 text-xl font-sans font-medium text-black tracking-tighter select-none px-8 py-10 -translate-x-2">
                      点击这里翻开
                    </span>
                  </div>
                </div>
              </div>

              {/* Journal Notebook - Illustration Style */}
              <motion.div
                className="relative w-80 h-[480px] cursor-pointer"
                onClick={handleOpenJournal}
                whileHover={isOpening ? undefined : "hover"}
                whileTap={isOpening ? undefined : "tap"}
                style={{ perspective: '1500px' }}
              >
                {/* Back Cover - Sharp at spine, rounded at edge */}
                <div 
                  className="absolute inset-0 shadow-[40px_40px_100px_rgba(0,0,0,0.5)]" 
                  style={{ 
                    borderRadius: '0 40px 30px 0',
                    backgroundColor: '#5A5A40',
                    backgroundImage: `
                      repeating-linear-gradient(45deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 4px),
                      linear-gradient(90deg, rgba(245, 245, 240, 0.3) 50%, transparent 50%),
                      linear-gradient(rgba(245, 245, 240, 0.3) 50%, transparent 50%),
                      linear-gradient(90deg, transparent 48%, rgba(26, 26, 26, 0.2) 48%, rgba(26, 26, 26, 0.2) 52%, transparent 52%),
                      linear-gradient(0deg, transparent 48%, rgba(26, 26, 26, 0.2) 48%, rgba(26, 26, 26, 0.2) 52%, transparent 52%)
                    `,
                    backgroundSize: '100% 100%, 80px 80px, 80px 80px, 80px 80px, 80px 80px'
                  }}
                />
                
                {/* Base Page (Static) */}
                <div 
                  className="absolute inset-y-2 left-0 right-0 bg-[#FDFDFB] dark:bg-[#1A1A1A] shadow-inner border-r-4 border-[#5A5A40]/10 overflow-hidden" 
                  style={{ 
                    borderRadius: '0 40px 30px 0',
                    backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, #E5E5E5 23px, #E5E5E5 24px)',
                    backgroundSize: '100% 24px',
                    backgroundPosition: '0 20px'
                  }}
                />

                {/* Rapid Flipping Pages (Only visible during opening) */}
                {isOpening && [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((delay, i) => (
                  <motion.div
                    key={i}
                    initial={{ rotateY: 0 }}
                    animate={{ rotateY: -180 }}
                    transition={{ duration: 0.5, delay, ease: "easeInOut" }}
                    className="absolute inset-y-2 left-0 right-0 bg-[#FDFDFB] dark:bg-[#1A1A1A] shadow-2xl border-r-4 border-[#5A5A40]/10 origin-left z-10"
                    style={{ 
                      borderRadius: '0 40px 30px 0',
                      backfaceVisibility: 'hidden',
                      backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, #E5E5E5 23px, #E5E5E5 24px)',
                      backgroundSize: '100% 24px',
                      backgroundPosition: '0 20px'
                    }}
                  />
                ))}
                
                {/* Front Cover - Illustration Style */}
                <motion.div
                  variants={{
                    idle: { rotateY: 0, x: 0, scale: 1 },
                    hover: { 
                      rotateY: -25, 
                      x: -12, 
                      zIndex: 40,
                      transition: { type: "spring", stiffness: 100, damping: 15 }
                    },
                    tap: {
                      rotateY: -30,
                      x: -15,
                      transition: { type: "spring", stiffness: 200, damping: 10 }
                    },
                    open: { 
                      rotateY: -180, 
                      x: 0,
                      scale: 1,
                      transition: { duration: 1.4, ease: [0.4, 0, 0.2, 1] } 
                    }
                  }}
                  initial="idle"
                  animate={isOpening ? "open" : undefined}
                  whileHover={isOpening ? undefined : "hover"}
                  whileTap={isOpening ? undefined : "tap"}
                  className="absolute inset-0 shadow-2xl origin-left z-20"
                  style={{ 
                    transformStyle: 'preserve-3d', 
                    borderLeft: '12px solid rgba(0,0,0,0.2)',
                    borderRadius: '0 40px 30px 0',
                    backgroundColor: '#5A5A40'
                  }}
                >
                  {/* Front Side of Cover */}
                  <div 
                    className="absolute inset-0" 
                    style={{ 
                      borderRadius: 'inherit',
                      backgroundColor: '#5A5A40',
                      backgroundImage: `
                        repeating-linear-gradient(45deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 4px),
                        linear-gradient(90deg, rgba(245, 245, 240, 0.3) 50%, transparent 50%),
                        linear-gradient(rgba(245, 245, 240, 0.3) 50%, transparent 50%),
                        linear-gradient(90deg, transparent 48%, rgba(26, 26, 26, 0.2) 48%, rgba(26, 26, 26, 0.2) 52%, transparent 52%),
                        linear-gradient(0deg, transparent 48%, rgba(26, 26, 26, 0.2) 48%, rgba(26, 26, 26, 0.2) 52%, transparent 52%)
                      `,
                      backgroundSize: '100% 100%, 80px 80px, 80px 80px, 80px 80px, 80px 80px'
                    }}
                  >
                    {/* Spine details - Hand-drawn lines */}
                    <div className="absolute left-4 top-6 bottom-6 w-1 bg-black/15 rounded-full" />
                    <div className="absolute left-7 top-12 bottom-12 w-0.5 bg-black/10 rounded-full" />
                    
                    {/* Cover Texture Overlay - Linen texture for fabric feel */}
                    <div className="absolute inset-0 opacity-30 pointer-events-none mix-blend-overlay" 
                         style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/linen.png")' }} />
                  </div>

                  {/* Inside of Cover (Visible after 180deg flip) */}
                  <div 
                    className="absolute inset-0 bg-[#E8E8E0] dark:bg-[#2A2A2A] shadow-inner"
                    style={{ 
                      transform: 'rotateY(180deg)', 
                      backfaceVisibility: 'hidden',
                      borderRadius: '40px 0 0 30px' // Flipped: Left rounded, Right (spine) sharp
                    }}
                  >
                    <div className="absolute inset-4 border border-[#5A5A40]/10 rounded-lg" />
                    <div className="absolute inset-0 opacity-10" 
                         style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/handmade-paper.png")' }} />
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {!isAIConfigured && (
              <div className="fixed top-0 left-0 right-0 z-[100] bg-[#8E3A3A] text-white py-2 px-4 text-center text-[10px] uppercase tracking-widest font-sans font-bold shadow-lg">
                AI 功能未配置：请在 Vercel 中设置 GEMINI_API_KEY 环境变量并重新部署
              </div>
            )}
            <header className="max-w-2xl mx-auto px-6 pt-12 pb-8 flex justify-between items-end">
        <div className="inline-grid grid-cols-1 w-fit">
          <h1 className="text-5xl font-brand text-[#5A5A40] dark:text-[#C5C5A5] transition-colors duration-500 leading-none m-0 p-0 whitespace-nowrap" style={{ fontFamily: '"Indie Flower", cursive' }}>
            InkEcho
          </h1>
          <div className="w-full flex justify-between items-center text-[14px] font-hand font-light text-[#5A5A40]/70 dark:text-[#C5C5A5]/70 mt-2 transition-colors duration-500">
            <div className="flex justify-between flex-[1.8]">
              {["让", "思", "绪", "如", "墨", "，"].map((char, i) => (
                <span key={i}>{char}</span>
              ))}
            </div>
            <div className="w-[4%]"></div>
            <div className="flex justify-between flex-1">
              {["让", "灵", "感", "沉", "淀"].map((char, i) => (
                <span key={i}>{char}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2 rounded-full hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10 transition-all duration-300 text-[#5A5A40] dark:text-[#C5C5A5]"
            title={theme === 'light' ? '深色模式' : '浅色模式'}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <div className="flex bg-[#5A5A40]/5 dark:bg-[#C5C5A5]/10 rounded-full p-1 transition-colors duration-500">
            <button 
              onClick={() => setLanguage('auto')}
              className={`px-3 py-1 rounded-full text-[10px] font-sans font-medium transition-all duration-300 ${language === 'auto' ? 'bg-[#5A5A40] dark:bg-[#C5C5A5] text-white dark:text-[#0F0F0F] shadow-sm' : 'text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 hover:text-[#5A5A40] dark:hover:text-[#C5C5A5]'}`}
            >
              自动
            </button>
            <button 
              onClick={() => setLanguage('en-US')}
              className={`px-3 py-1 rounded-full text-[10px] font-sans font-medium transition-all duration-300 ${language === 'en-US' ? 'bg-[#5A5A40] dark:bg-[#C5C5A5] text-white dark:text-[#0F0F0F] shadow-sm' : 'text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 hover:text-[#5A5A40] dark:hover:text-[#C5C5A5]'}`}
            >
              EN
            </button>
            <button 
              onClick={() => setLanguage('zh-CN')}
              className={`px-3 py-1 rounded-full text-[10px] font-sans font-medium transition-all duration-300 ${language === 'zh-CN' ? 'bg-[#5A5A40] dark:bg-[#C5C5A5] text-white dark:text-[#0F0F0F] shadow-sm' : 'text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 hover:text-[#5A5A40] dark:hover:text-[#C5C5A5]'}`}
            >
              中
            </button>
          </div>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 rounded-full hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10 transition-all duration-300 text-[#5A5A40] dark:text-[#C5C5A5]"
            title="历史记录"
          >
            <History size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 pb-24">
        <AnimatePresence mode="wait">
          {showHistory ? (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  {/* View Label */}
                  <div className="px-3 py-1.5 rounded-full bg-[#5A5A40]/10 dark:bg-[#C5C5A5]/10 border border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 transition-colors duration-500">
                    <h2 className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#5A5A40] dark:text-[#C5C5A5]">往昔记录</h2>
                  </div>
                  
                  {/* Filter Action */}
                  <button 
                    onClick={() => setShowCalendar(!showCalendar)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${
                      selectedDate || showCalendar 
                        ? 'bg-[#5A5A40] text-white border-[#5A5A40] dark:bg-[#C5C5A5] dark:text-[#0F0F0F] dark:border-[#C5C5A5] shadow-sm shadow-[#5A5A40]/20 dark:shadow-black/40' 
                        : 'text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 hover:border-[#5A5A40]/40 dark:hover:border-[#C5C5A5]/40 hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10'
                    }`}
                  >
                    <CalendarIcon size={12} className={!selectedDate && !showCalendar ? "animate-pulse" : ""} />
                    <span className="text-[11px] font-sans font-bold uppercase tracking-wider">
                      {selectedDate ? format(selectedDate, 'yyyy/MM/dd') : "按日期筛选"}
                    </span>
                    {selectedDate && (
                      <X 
                        size={12} 
                        className="ml-1 hover:scale-125 transition-transform" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(null);
                          setCurrentPage(1);
                        }}
                      />
                    )}
                  </button>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="py-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-[#5A5A40] dark:text-[#C5C5A5] hover:underline underline-offset-4 transition-all duration-300"
                >
                  返回日记
                </button>
              </div>

              {/* Calendar Popover */}
              <AnimatePresence>
                {showCalendar && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden bg-white/40 dark:bg-[#1A1A1A]/40 rounded-2xl border border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 p-4 mb-8"
                  >
                    <div className="flex justify-between items-center mb-4 px-2">
                      <h3 className="text-xs font-sans font-bold text-[#5A5A40] dark:text-[#C5C5A5]">
                        {format(calendarMonth, 'yyyy年 MMMM', { locale: zhCN })}
                      </h3>
                      <div className="flex gap-1">
                        <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="p-1 hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10 rounded-full text-[#5A5A40] dark:text-[#C5C5A5]"><ChevronLeft size={16} /></button>
                        <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="p-1 hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10 rounded-full text-[#5A5A40] dark:text-[#C5C5A5]"><ChevronRight size={16} /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                        <div key={day} className="text-[10px] font-sans font-medium text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 py-1">{day}</div>
                      ))}
                      {Array.from({ length: startOfMonth(calendarMonth).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) }).map(day => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const hasEntries = !!entriesByDate[dateKey];
                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const isCurrentDay = isToday(day);
                        
                        return (
                          <button
                            key={dateKey}
                            onClick={() => {
                              setSelectedDate(isSelected ? null : day);
                              setCurrentPage(1);
                            }}
                            className={`
                              relative text-xs font-sans p-2 rounded-lg transition-all
                              ${isSelected ? 'bg-[#5A5A40] text-white dark:bg-[#C5C5A5] dark:text-[#0F0F0F] font-bold' : 'hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10 text-[#5A5A40] dark:text-[#C5C5A5]'}
                              ${isCurrentDay && !isSelected ? 'ring-1 ring-[#5A5A40]/20 dark:ring-[#C5C5A5]/20' : ''}
                            `}
                          >
                            {format(day, 'd')}
                            {hasEntries && (
                              <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? 'bg-white dark:bg-[#0F0F0F]' : 'bg-[#5A5A40]/40 dark:bg-[#C5C5A5]/40'}`} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {filteredEntries.length === 0 ? (
                <div className="py-20 text-center text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 italic transition-colors duration-500">
                  {selectedDate ? "该日期暂无记录。" : "暂无记录。你的思绪将在此呈现。"}
                </div>
              ) : (
                <div className="space-y-8">
                  {paginatedEntries.map(entry => {
                    const text = entry.status === 'accepted' ? entry.refinedText : entry.rawTranscript;
                    // Improved heuristic for long text: character count or line count
                    const isLong = text.length > 80 || text.split('\n').length > 2;
                    
                    return (
                      <div key={entry.id} className="group relative border-b border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 pb-8 last:border-0 transition-colors duration-500">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-sans font-medium uppercase tracking-tighter text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 transition-colors duration-500">
                            {new Date(entry.timestamp).toLocaleDateString(undefined, { 
                              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={() => {
                                setViewingEntry(entry);
                                setIsEditingInModal(true);
                                setModalEditText(entry.status === 'accepted' ? entry.refinedText : entry.rawTranscript);
                              }}
                              className="p-1 text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 hover:text-[#5A5A40] dark:hover:text-[#C5C5A5] transition-all"
                              title="编辑记录"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => setEntryToDelete(entry.id)}
                              className="p-1 text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 hover:text-red-800 dark:hover:text-red-400 transition-all"
                              title="删除记录"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-lg leading-relaxed text-[#1A1A1A]/80 dark:text-[#E8E8E0]/80 transition-colors duration-500 whitespace-pre-wrap line-clamp-3">
                            {text}
                          </p>
                          {isLong && (
                            <button 
                              onClick={() => setViewingEntry(entry)}
                              className="text-[10px] font-sans font-bold text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 hover:text-[#5A5A40] dark:hover:text-[#C5C5A5] transition-colors flex items-center gap-1"
                            >
                              查看全文
                              <ChevronRight size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-6 pt-12">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => { setCurrentPage(currentPage - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="flex items-center gap-1 text-[10px] font-sans font-bold uppercase tracking-wider text-[#5A5A40] dark:text-[#C5C5A5] disabled:opacity-20 hover:underline underline-offset-4 transition-all"
                  >
                    <ChevronLeft size={14} /> 上一页
                  </button>
                  
                  <div className="flex items-center gap-3">
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const pageNum = i + 1;
                      // Show current page, first, last, and pages around current
                      if (
                        pageNum === 1 || 
                        pageNum === totalPages || 
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={i}
                            onClick={() => { setCurrentPage(pageNum); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className={`min-w-[24px] h-6 flex items-center justify-center rounded-full text-[10px] font-sans font-bold transition-all ${
                              currentPage === pageNum 
                                ? 'bg-[#5A5A40] text-white dark:bg-[#C5C5A5] dark:text-[#0F0F0F]' 
                                : 'text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                      // Show ellipsis
                      if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                        return <span key={i} className="text-[#5A5A40]/20 dark:text-[#C5C5A5]/20"><MoreHorizontal size={12} /></span>;
                      }
                      return null;
                    })}
                  </div>

                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => { setCurrentPage(currentPage + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="flex items-center gap-1 text-[10px] font-sans font-bold uppercase tracking-wider text-[#5A5A40] dark:text-[#C5C5A5] disabled:opacity-20 hover:underline underline-offset-4 transition-all"
                  >
                    下一页 <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="journal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              {/* Recording / Transcribing State */}
              <div className="min-h-[300px] flex flex-col justify-center">
                {isRecording ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 text-xs font-sans uppercase tracking-widest animate-pulse transition-colors duration-500">
                      <span className="w-2 h-2 rounded-full bg-[#8E3A3A] dark:bg-[#D16D6D] shadow-[0_0_8px_rgba(142,58,58,0.5)]" />
                      正在倾听...
                    </div>
                    <p className="text-2xl leading-relaxed text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 italic transition-colors duration-500">
                      {transcript || "说出你的想法..."}
                      <span className="inline-block w-0.5 h-6 bg-[#5A5A40]/40 dark:text-[#C5C5A5]/40 animate-pulse ml-1 align-middle" />
                    </p>
                  </div>
                ) : isRefining ? (
                  <div className="flex flex-col items-center justify-center space-y-4 py-20">
                    <div className="w-12 h-12 border-2 border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 border-t-[#5A5A40] dark:border-t-[#C5C5A5] rounded-full animate-spin transition-colors duration-500" />
                    <p className="text-xs font-sans uppercase tracking-widest text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 transition-colors duration-500">整理中...</p>
                  </div>
                ) : currentEntry ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative p-10 bg-white/40 dark:bg-[#1A1A1A] rounded-[2.5rem] border border-[#5A5A40]/10 dark:border-[#C5C5A5]/20 shadow-sm dark:shadow-xl dark:shadow-black/20 overflow-hidden transition-colors duration-500"
                  >
                    {/* Entry Background Texture */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.15] dark:opacity-[0.08] z-0" 
                         style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/handmade-paper.png")' }} />
                    
                    <div className="relative z-10 space-y-12">
                      <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-[10px] uppercase tracking-widest font-sans font-semibold text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 transition-colors duration-500">精炼思绪</h3>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => setShowDiff(!showDiff)}
                            className="flex items-center gap-1.5 text-[10px] font-sans font-medium text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 hover:text-[#5A5A40] dark:hover:text-[#C5C5A5] transition-colors"
                          >
                            {showDiff ? <EyeOff size={12} /> : <Eye size={12} />}
                            {showDiff ? '隐藏调整' : '调整可见'}
                          </button>
                          <button 
                            onClick={() => setIsEditing(!isEditing)}
                            className={`flex items-center gap-1.5 text-[10px] font-sans font-medium transition-colors ${isEditing ? 'text-[#5A5A40] dark:text-[#C5C5A5]' : 'text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 hover:text-[#5A5A40] dark:hover:text-[#C5C5A5]'}`}
                          >
                            <Edit3 size={12} />
                            {isEditing ? '完成编辑' : '手动修改'}
                          </button>
                        </div>
                      </div>
                      
                      {isEditing ? (
                        <textarea
                          value={currentEntry.refinedText}
                          onChange={(e) => setCurrentEntry({ ...currentEntry, refinedText: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              setIsEditing(false);
                            }
                          }}
                          className="w-full min-h-[280px] p-4 bg-white/50 dark:bg-black/40 border border-[#5A5A40]/10 dark:border-[#C5C5A5]/20 rounded-2xl text-xl leading-relaxed text-[#1A1A1A] dark:text-[#E8E8E0] focus:outline-none focus:ring-1 focus:ring-[#5A5A40]/20 dark:focus:ring-[#C5C5A5]/20 font-serif resize-none transition-all duration-300"
                          autoFocus
                        />
                      ) : (
                        <div 
                          onDoubleClick={() => setIsEditing(true)}
                          className="text-xl leading-relaxed text-[#1A1A1A] dark:text-[#E8E8E0] cursor-default select-none transition-colors duration-500"
                          title="双击进入编辑"
                        >
                          {showDiff ? renderDiff(currentEntry.rawTranscript, currentEntry.refinedText) : currentEntry.refinedText}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 pt-8 border-t border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 transition-colors duration-500">
                      <h3 className="text-[10px] uppercase tracking-widest font-sans font-semibold text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 transition-colors duration-500">原始语音</h3>
                      <p className="text-lg leading-relaxed text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 italic transition-colors duration-500">
                        {currentEntry.rawTranscript}
                      </p>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button 
                        onClick={keepOriginal}
                        className="flex-1 border border-[#5A5A40]/20 dark:border-[#C5C5A5]/30 text-[#5A5A40] dark:text-[#C5C5A5] py-4 rounded-full font-sans font-medium flex items-center justify-center gap-2 hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10 transition-all duration-300"
                      >
                        <RotateCcw size={18} /> 使用原稿
                      </button>
                      <button 
                        onClick={acceptRefined}
                        className="flex-1 bg-[#5A5A40] dark:bg-[#C5C5A5] text-white dark:text-[#0F0F0F] py-4 rounded-full font-sans font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] dark:hover:bg-[#B5B595] transition-all duration-300 shadow-lg shadow-[#5A5A40]/20 dark:shadow-black/40"
                      >
                        <Check size={18} /> 保留精炼
                      </button>
                      <button 
                        onClick={discardEntry}
                        className="p-4 border border-red-900/10 dark:border-red-400/20 text-red-900/30 dark:text-red-400/40 hover:text-red-900 dark:hover:text-red-400 hover:bg-red-900/5 dark:hover:bg-red-400/10 transition-all duration-300 rounded-full"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                </motion.div>
                ) : isRefining ? (
                  <div className="flex flex-col items-center justify-center space-y-4 py-20">
                    <div className="w-12 h-12 border-2 border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 border-t-[#5A5A40] dark:border-t-[#C5C5A5] rounded-full animate-spin transition-colors duration-500" />
                    <p className="text-xs font-sans uppercase tracking-widest text-[#5A5A40]/60 dark:text-[#C5C5A5]/60 transition-colors duration-500">整理中...</p>
                  </div>
                ) : (
                  <div className="py-20" />
                )}
              </div>

              {/* Control Button */}
              {!currentEntry && !isRefining && (
                <div className="fixed bottom-24 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="relative flex items-center justify-center">
                    {/* Reminder Bubble */}
                    {!isRecording && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                        className="absolute -top-16 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white dark:bg-[#1A1A1A] px-4 py-2 rounded-2xl shadow-xl border border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 text-sm font-sans font-medium text-[#5A5A40] dark:text-[#C5C5A5] flex items-center gap-2 pointer-events-auto"
                      >
                        <div className="w-2 h-2 rounded-full bg-[#8E3A3A] animate-pulse" />
                        点击麦克风开始记录语音日记
                        {/* Triangle pointer */}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-[#1A1A1A] border-r border-b border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 rotate-45" />
                      </motion.div>
                    )}

                    {/* Ripple Effect */}
                    {isRecording && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            initial={{ scale: 0.8, opacity: 0.5 }}
                            animate={{ 
                              scale: [1, 3],
                              opacity: [0.5, 0.2, 0]
                            }}
                            transition={{
                              duration: 4,
                              repeat: Infinity,
                              ease: "easeOut",
                              delay: i * 1.3,
                            }}
                            className="absolute w-20 h-20 rounded-full bg-[#8E3A3A]/20 dark:bg-[#D16D6D]/20"
                          />
                        ))}
                      </div>
                    )}
                    
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`pointer-events-auto relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
                        isRecording 
                          ? 'bg-[#8E3A3A] dark:bg-[#D16D6D] text-white dark:text-[#0F0F0F] shadow-[#8E3A3A]/40 dark:shadow-[#D16D6D]/20 scale-110' 
                          : 'bg-[#5A5A40] dark:bg-[#C5C5A5] text-white dark:text-[#0F0F0F] shadow-[#5A5A40]/30 dark:shadow-black/60'
                      }`}
                    >
                      {isRecording ? <Square size={28} fill="currentColor" /> : <Mic size={32} />}
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Background Texture */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.2] dark:opacity-[0.04] z-[-1] transition-opacity duration-500" 
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/handmade-paper.png")' }} />
      <div className="fixed inset-0 pointer-events-none opacity-[0.1] dark:opacity-[0.02] z-[-1] transition-opacity duration-500" 
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")' }} />
      <div className="fixed inset-0 pointer-events-none opacity-[0.08] dark:opacity-[0.05] z-[-1] bg-gradient-to-b from-transparent to-[#5A5A40]/10 dark:to-black/50 transition-all duration-500" />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {entryToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEntryToDelete(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-all duration-500"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-[#F5F5F0] dark:bg-[#1A1A1A] rounded-3xl shadow-2xl overflow-hidden border border-white/10 dark:border-white/5 transition-colors duration-500"
            >
              <div className="relative p-8 space-y-6 z-10">
                <div className="space-y-2">
                  <h3 className="text-lg font-sans font-semibold text-[#1A1A1A] dark:text-[#E8E8E0]">确认删除？</h3>
                  <p className="text-sm text-[#5A5A40]/60 dark:text-[#C5C5A5]/60">此操作无法撤销，确定要永久删除这条记录吗？</p>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setEntryToDelete(null)}
                    className="flex-1 px-6 py-3 rounded-full font-sans font-medium text-[#5A5A40] dark:text-[#C5C5A5] border border-[#5A5A40]/10 dark:border-[#C5C5A5]/20 hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/5 transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      deleteEntry(entryToDelete);
                      setEntryToDelete(null);
                    }}
                    className="flex-1 px-6 py-3 rounded-full font-sans font-medium bg-red-800 dark:bg-red-900/80 text-white hover:bg-red-700 dark:hover:bg-red-800 transition-all shadow-lg shadow-red-800/20"
                  >
                    确认删除
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Entry Detail Modal */}
      <AnimatePresence>
        {viewingEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setViewingEntry(null);
                setIsEditingInModal(false);
              }}
              className="absolute inset-0 bg-[#E4E3E0]/80 dark:bg-[#0F0F0F]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-[#1A1A1A] rounded-3xl shadow-2xl border border-[#5A5A40]/10 dark:border-[#C5C5A5]/10 overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-[#5A5A40]/5 dark:border-[#C5C5A5]/5 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-[#5A5A40]/40 dark:text-[#C5C5A5]/40">
                    {new Date(viewingEntry.timestamp).toLocaleDateString(undefined, { 
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                    })}
                  </span>
                  <span className="text-[10px] font-sans font-medium text-[#5A5A40]/30 dark:text-[#C5C5A5]/30">
                    {new Date(viewingEntry.timestamp).toLocaleTimeString(undefined, { 
                      hour: '2-digit', minute: '2-digit' 
                    })}
                  </span>
                </div>
                <button 
                  onClick={() => {
                    setViewingEntry(null);
                    setIsEditingInModal(false);
                  }}
                  className="p-2 rounded-full hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10 text-[#5A5A40] dark:text-[#C5C5A5] transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                {isEditingInModal ? (
                  <textarea
                    value={modalEditText}
                    onChange={(e) => setModalEditText(e.target.value)}
                    autoFocus
                    className="w-full h-full min-h-[300px] bg-transparent text-xl leading-relaxed text-[#1A1A1A] dark:text-[#E8E8E0] whitespace-pre-wrap font-serif italic focus:outline-none resize-none"
                  />
                ) : (
                  <div className="group relative">
                    <p 
                      onDoubleClick={() => {
                        setIsEditingInModal(true);
                        setModalEditText(viewingEntry.status === 'accepted' ? viewingEntry.refinedText : viewingEntry.rawTranscript);
                      }}
                      className="text-xl leading-relaxed text-[#1A1A1A] dark:text-[#E8E8E0] whitespace-pre-wrap font-serif italic cursor-pointer transition-opacity hover:opacity-90"
                      title="双击进入编辑模式"
                    >
                      {viewingEntry.status === 'accepted' ? viewingEntry.refinedText : viewingEntry.rawTranscript}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-sans font-medium text-[#5A5A40]/20 dark:text-[#C5C5A5]/20">
                      <Edit3 size={10} />
                      <span>双击文本可直接进入编辑模式</span>
                    </div>
                  </div>
                )}
              </div>
              {isEditingInModal && (
                <div className="p-6 bg-[#5A5A40]/5 dark:bg-[#C5C5A5]/5 flex justify-end gap-3">
                  <button 
                    onClick={() => setIsEditingInModal(false)}
                    className="px-6 py-2 rounded-full border border-[#5A5A40]/20 dark:border-[#C5C5A5]/20 text-[#5A5A40] dark:text-[#C5C5A5] text-xs font-sans font-bold uppercase tracking-widest hover:bg-[#5A5A40]/5 transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      updateEntryText(viewingEntry.id, modalEditText);
                      setViewingEntry({ ...viewingEntry, refinedText: modalEditText, status: 'accepted' });
                      setIsEditingInModal(false);
                    }}
                    className="px-6 py-2 rounded-full bg-[#5A5A40] text-white dark:bg-[#C5C5A5] dark:text-[#0F0F0F] text-xs font-sans font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-[#5A5A40]/20"
                  >
                    保存修改
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
