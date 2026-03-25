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
      console.error('Speech recognition error', event.error);
      stopRecording();
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
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

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''} bg-[#F5F5F0] dark:bg-[#0F0F0F] text-[#1A1A1A] dark:text-[#E8E8E0] font-serif selection:bg-[#5A5A40]/20 transition-colors duration-500`}>
      {!isAIConfigured && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-[#8E3A3A] text-white py-2 px-4 text-center text-[10px] uppercase tracking-widest font-sans font-bold shadow-lg">
          AI 功能未配置：请在 Vercel 中设置 GEMINI_API_KEY 环境变量并重新部署
        </div>
      )}
      <header className="max-w-2xl mx-auto px-6 pt-12 pb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-brand text-[#5A5A40] dark:text-[#C5C5A5] -rotate-1 transition-colors duration-500">InkEcho</h1>
          <p className="text-lg font-hand text-[#5A5A40]/70 dark:text-[#C5C5A5]/70 mt-0 transition-colors duration-500">Think out loud, let it settle.</p>
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
                          className="w-full min-h-[150px] p-4 bg-white/50 dark:bg-black/40 border border-[#5A5A40]/10 dark:border-[#C5C5A5]/20 rounded-2xl text-2xl leading-relaxed text-[#1A1A1A] dark:text-[#E8E8E0] focus:outline-none focus:ring-1 focus:ring-[#5A5A40]/20 dark:focus:ring-[#C5C5A5]/20 font-serif resize-none transition-all duration-300"
                          autoFocus
                        />
                      ) : (
                        <div 
                          onDoubleClick={() => setIsEditing(true)}
                          className="text-2xl leading-relaxed text-[#1A1A1A] dark:text-[#E8E8E0] cursor-default select-none transition-colors duration-500"
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
                        onClick={acceptRefined}
                        className="flex-1 bg-[#5A5A40] dark:bg-[#C5C5A5] text-white dark:text-[#0F0F0F] py-4 rounded-full font-sans font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] dark:hover:bg-[#B5B595] transition-all duration-300 shadow-lg shadow-[#5A5A40]/20 dark:shadow-black/40"
                      >
                        <Check size={18} /> 保留精炼
                      </button>
                      <button 
                        onClick={keepOriginal}
                        className="flex-1 border border-[#5A5A40]/20 dark:border-[#C5C5A5]/30 text-[#5A5A40] dark:text-[#C5C5A5] py-4 rounded-full font-sans font-medium flex items-center justify-center gap-2 hover:bg-[#5A5A40]/5 dark:hover:bg-[#C5C5A5]/10 transition-all duration-300"
                      >
                        <RotateCcw size={18} /> 使用原稿
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
                  <div className="text-center space-y-8 py-20">
                    <p className="text-xl text-[#5A5A40]/40 dark:text-[#C5C5A5]/40 italic transition-colors duration-500">
                      让思绪如墨，在寂静中悄然洇开...
                    </p>
                  </div>
                )}
              </div>

              {/* Control Button */}
              {!currentEntry && !isRefining && (
                <div className="fixed bottom-12 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="relative flex items-center justify-center">
                    {/* Ripple Effect */}
                    {isRecording && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <motion.div
                            key={i}
                            initial={{ scale: 0.8, opacity: 0.5 }}
                            animate={{ 
                              scale: [1, 3.5],
                              opacity: [0.5, 0.2, 0]
                            }}
                            transition={{
                              duration: 3,
                              repeat: Infinity,
                              ease: "easeOut",
                              delay: i * 0.6,
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
    </div>
  );
}
